import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { CORS_HEADERS } from '../shared/cors';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const SUBMISSIONS_TABLE = process.env.SUBMISSIONS_TABLE!;
const TASKS_TABLE = process.env.TASKS_TABLE!;

export const handler: APIGatewayProxyHandler = async (event) => {
    console.log('Event:', JSON.stringify(event));

    try {
        if (!event.requestContext.authorizer) {
            return {
                statusCode: 401,
                headers: CORS_HEADERS,
                body: JSON.stringify({ message: 'Unauthorized' }),
            };
        }

        const requesterId = event.requestContext.authorizer.claims.sub;
        const submissionId = event.pathParameters?.submissionId;
        const body = JSON.parse(event.body || '{}');
        const { decision, reason } = body;

        if (!submissionId || !decision || !['APPROVE', 'REJECT'].includes(decision)) {
            return {
                statusCode: 400,
                headers: CORS_HEADERS,
                body: JSON.stringify({ message: 'Invalid request' }),
            };
        }

        // 1. Get Submission to find taskId
        const subResult = await docClient.send(new GetCommand({
            TableName: SUBMISSIONS_TABLE,
            Key: { submissionId }
        }));

        if (!subResult.Item) {
            return {
                statusCode: 404,
                headers: CORS_HEADERS,
                body: JSON.stringify({ message: 'Submission not found' }),
            };
        }

        const taskId = subResult.Item.taskId;

        // 2. Verify Task Ownership
        const taskResult = await docClient.send(new GetCommand({
            TableName: TASKS_TABLE,
            Key: { taskId }
        }));

        if (!taskResult.Item || taskResult.Item.requesterId !== requesterId) {
            return {
                statusCode: 403,
                headers: CORS_HEADERS,
                body: JSON.stringify({ message: 'Unauthorized' }),
            };
        }

        // 3. Update Submission Status
        const newStatus = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';

        await docClient.send(new UpdateCommand({
            TableName: SUBMISSIONS_TABLE,
            Key: { submissionId },
            UpdateExpression: 'set #status = :status, feedback = :feedback, reviewedAt = :reviewedAt',
            ExpressionAttributeNames: {
                '#status': 'status'
            },
            ExpressionAttributeValues: {
                ':status': newStatus,
                ':feedback': reason || '',
                ':reviewedAt': new Date().toISOString()
            }
        }));

        if (decision === 'APPROVE') {
            await docClient.send(new UpdateCommand({
                TableName: TASKS_TABLE,
                Key: { taskId },
                UpdateExpression: 'set #status = :status',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: { ':status': 'COMPLETED' }
            }));
        } else if (decision === 'REJECT') {
            await docClient.send(new UpdateCommand({
                TableName: TASKS_TABLE,
                Key: { taskId },
                UpdateExpression: 'set #status = :status, assignedTo = :empty',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: { ':status': 'AVAILABLE', ':empty': null }
            }));
        }

        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: `Submission ${newStatus}`, submissionId }),
        };

    } catch (error) {
        console.error('Error reviewing submission:', error);
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: 'Internal Server Error' }),
        };
    }
};
