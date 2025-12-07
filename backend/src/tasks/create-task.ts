import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TASKS_TABLE = process.env.TASKS_TABLE || '';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (!event.body) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': true,
                },
                body: JSON.stringify({ message: 'Missing body' })
            };
        }

        const body = JSON.parse(event.body);
        const taskId = uuidv4();
        const timestamp = new Date().toISOString();
        const requesterId = event.requestContext.authorizer?.claims?.sub;
        const requesterName = event.requestContext.authorizer?.claims?.name ||
            event.requestContext.authorizer?.claims?.preferred_username ||
            event.requestContext.authorizer?.claims?.email ||
            'Unknown Requester';

        const task = {
            taskId,
            ...body,
            requesterId,
            requesterName,
            createdAt: timestamp,
            status: 'AVAILABLE',
        };

        await docClient.send(new PutCommand({
            TableName: TASKS_TABLE,
            Item: task,
        }));

        return {
            statusCode: 201,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true,
            },
            body: JSON.stringify(task),
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
