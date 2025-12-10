import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { CORS_HEADERS } from '../shared/cors';
import { v4 as uuidv4 } from 'uuid';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const DISPUTES_TABLE = process.env.DISPUTES_TABLE!;
const SUBMISSIONS_TABLE = process.env.SUBMISSIONS_TABLE!;

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (!event.requestContext.authorizer) {
            return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Unauthorized' }) };
        }

        const workerId = event.requestContext.authorizer.claims.sub;
        const body = JSON.parse(event.body || '{}');
        const { submissionId, reason } = body;

        if (!submissionId || !reason) {
            return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Missing fields' }) };
        }

        // Verify Submission Ownership
        const subResult = await docClient.send(new GetCommand({
            TableName: SUBMISSIONS_TABLE,
            Key: { submissionId }
        }));

        if (!subResult.Item) {
            return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Submission not found' }) };
        }

        if (subResult.Item.workerId !== workerId) {
            return { statusCode: 403, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Unauthorized' }) };
        }

        if (subResult.Item.status !== 'REJECTED') {
            return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Can only dispute rejected submissions' }) };
        }

        const disputeId = uuidv4();
        const createdAt = new Date().toISOString();

        const dispute = {
            disputeId,
            submissionId,
            workerId,
            taskId: subResult.Item.taskId,
            reason,
            status: 'OPEN',
            createdAt
        };

        await docClient.send(new PutCommand({
            TableName: DISPUTES_TABLE,
            Item: dispute
        }));

        return {
            statusCode: 201,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: 'Dispute created', disputeId })
        };

    } catch (error) {
        console.error(error);
        return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Internal Error' }) };
    }
};
