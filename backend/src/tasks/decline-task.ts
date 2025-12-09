import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { CORS_HEADERS } from '../shared/cors';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TASKS_TABLE = process.env.TASKS_TABLE!;
const WORKERS_TABLE = process.env.WORKERS_TABLE!;

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

        const workerId = event.requestContext.authorizer.claims.sub;
        const taskId = event.pathParameters?.taskId;

        if (!taskId) {
            return {
                statusCode: 400,
                headers: CORS_HEADERS,
                body: JSON.stringify({ message: 'Missing taskId' }),
            };
        }

        // 1. Verify Task Ownership & Status
        const taskResult = await docClient.send(new GetCommand({
            TableName: TASKS_TABLE,
            Key: { taskId }
        }));

        if (!taskResult.Item) {
            return {
                statusCode: 404,
                headers: CORS_HEADERS,
                body: JSON.stringify({ message: 'Task not found' }),
            };
        }

        const task = taskResult.Item;

        if (task.assignedTo !== workerId) {
            return {
                statusCode: 403,
                headers: CORS_HEADERS,
                body: JSON.stringify({ message: 'Task is not assigned to you' }),
            };
        }

        if (task.status !== 'ASSIGNED') {
            return {
                statusCode: 400,
                headers: CORS_HEADERS,
                body: JSON.stringify({ message: 'Task is not in ASSIGNED state' }),
            };
        }

        // 2. Decline Task (Reset to AVAILABLE)
        await docClient.send(new UpdateCommand({
            TableName: TASKS_TABLE,
            Key: { taskId },
            UpdateExpression: 'REMOVE assignedTo, assignedAt SET #status = :status, declineCount = if_not_exists(declineCount, :zero) + :inc',
            ExpressionAttributeNames: {
                '#status': 'status'
            },
            ExpressionAttributeValues: {
                ':status': 'AVAILABLE',
                ':zero': 0,
                ':inc': 1
            }
        }));

        // 3. Apply Penalty to Worker
        // reducing reputation by 5 points
        await docClient.send(new UpdateCommand({
            TableName: WORKERS_TABLE,
            Key: { workerId },
            UpdateExpression: 'SET reputation = if_not_exists(reputation, :defaultRep) - :penalty',
            ExpressionAttributeValues: {
                ':defaultRep': 100, // Start with 100 if not set
                ':penalty': 5
            }
        }));

        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: 'Task declined. Penalty applied.' }),
        };

    } catch (error) {
        console.error('Error declining task:', error);
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: 'Internal Server Error' }),
        };
    }
};
