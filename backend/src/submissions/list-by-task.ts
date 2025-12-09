import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { CORS_HEADERS } from '../shared/cors';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const SUBMISSIONS_TABLE = process.env.SUBMISSIONS_TABLE!;
const TASKS_TABLE = process.env.TASKS_TABLE!;

export const handler: APIGatewayProxyHandler = async (event) => {
    console.log('Event:', JSON.stringify(event));

    try {
        // 1. Validate Auth
        if (!event.requestContext.authorizer) {
            return {
                statusCode: 401,
                headers: CORS_HEADERS,
                body: JSON.stringify({ message: 'Unauthorized' }),
            };
        }

        const requesterId = event.requestContext.authorizer.claims.sub;
        const taskId = event.pathParameters?.taskId;

        if (!taskId) {
            return {
                statusCode: 400,
                headers: CORS_HEADERS,
                body: JSON.stringify({ message: 'Missing taskId' }),
            };
        }

        // 2. Verify Task Ownership
        // We need to ensure the requester requesting the submissions is the one who created the task
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

        if (taskResult.Item.requesterId !== requesterId) {
            return {
                statusCode: 403,
                headers: CORS_HEADERS,
                body: JSON.stringify({ message: 'You are not authorized to view submissions for this task' }),
            };
        }

        // 3. Query Submissions
        const result = await docClient.send(new QueryCommand({
            TableName: SUBMISSIONS_TABLE,
            IndexName: 'byTask',
            KeyConditionExpression: 'taskId = :taskId',
            ExpressionAttributeValues: {
                ':taskId': taskId
            }
        }));

        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify({ submissions: result.Items || [] }),
        };

    } catch (error) {
        console.error('Error listing task submissions:', error);
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: 'Internal Server Error' }),
        };
    }
};
