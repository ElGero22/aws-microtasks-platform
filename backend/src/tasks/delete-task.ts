import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TASKS_TABLE = process.env.TASKS_TABLE || '';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        const taskId = event.pathParameters?.taskId;
        const requesterId = event.requestContext.authorizer?.claims?.sub;

        if (!taskId || !requesterId) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': true,
                },
                body: JSON.stringify({ message: 'Missing taskId or unauthorized' }),
            };
        }

        // First, get the task to verify ownership
        const getCommand = new GetCommand({
            TableName: TASKS_TABLE,
            Key: { taskId },
        });

        const taskResponse = await docClient.send(getCommand);

        if (!taskResponse.Item) {
            return {
                statusCode: 404,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': true,
                },
                body: JSON.stringify({ message: 'Task not found' }),
            };
        }

        // Verify that the requester is the owner
        if (taskResponse.Item.requesterId !== requesterId) {
            return {
                statusCode: 403,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': true,
                },
                body: JSON.stringify({ message: 'Not authorized to delete this task' }),
            };
        }

        // Delete the task
        const deleteCommand = new DeleteCommand({
            TableName: TASKS_TABLE,
            Key: { taskId },
        });

        await docClient.send(deleteCommand);

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true,
            },
            body: JSON.stringify({ message: 'Task deleted successfully' }),
        };
    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true,
            },
            body: JSON.stringify({ message: 'Internal Server Error' }),
        };
    }
};
