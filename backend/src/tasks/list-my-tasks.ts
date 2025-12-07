import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TASKS_TABLE = process.env.TASKS_TABLE || '';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        // Get workerId from authorizer context
        const workerId = event.requestContext.authorizer?.claims?.sub;

        if (!workerId) {
            return {
                statusCode: 401,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': true,
                },
                body: JSON.stringify({ message: 'Unauthorized' }),
            };
        }

        // Query tasks assigned to this worker
        // Note: This requires a GSI on assignedTo
        const command = new QueryCommand({
            TableName: TASKS_TABLE,
            IndexName: 'AssignedToIndex',
            KeyConditionExpression: 'assignedTo = :workerId',
            ExpressionAttributeValues: {
                ':workerId': workerId,
            },
        });

        const response = await docClient.send(command);

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true,
            },
            body: JSON.stringify({ tasks: response.Items || [] }),
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
