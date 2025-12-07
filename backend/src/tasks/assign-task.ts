import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TASKS_TABLE = process.env.TASKS_TABLE || '';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (!event.body) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Credentials': true },
                body: JSON.stringify({ message: 'Missing request body' }),
            };
        }

        const body = JSON.parse(event.body);
        const { taskId, workerId } = body;

        if (!taskId || !workerId) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Credentials': true },
                body: JSON.stringify({ message: 'Missing taskId or workerId' }),
            };
        }

        const command = new UpdateCommand({
            TableName: TASKS_TABLE,
            Key: { taskId },
            UpdateExpression: 'set #status = :assigned, assignedTo = :workerId, assignedAt = :assignedAt',
            ConditionExpression: '#status = :available',
            ExpressionAttributeNames: {
                '#status': 'status',
            },
            ExpressionAttributeValues: {
                ':assigned': 'ASSIGNED',
                ':workerId': workerId,
                ':assignedAt': new Date().toISOString(),
                ':available': 'AVAILABLE',
            },
            ReturnValues: 'ALL_NEW',
        });

        const response = await docClient.send(command);

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true,
            },
            body: JSON.stringify({ message: 'Task assigned successfully', task: response.Attributes }),
        };
    } catch (error: any) {
        console.error('Error assigning task:', error);
        if (error.name === 'ConditionalCheckFailedException') {
            return {
                statusCode: 409, // Conflict
                headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Credentials': true },
                body: JSON.stringify({ message: 'Task is not available for assignment' }),
            };
        }
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Credentials': true },
            body: JSON.stringify({ message: 'Internal Server Error' }),
        };
    }
};
