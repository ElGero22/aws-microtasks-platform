import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { CORS_HEADERS } from '../shared/cors';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const DISPUTES_TABLE = process.env.DISPUTES_TABLE!;

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        // In a real app, verify admin role here
        // const groups = event.requestContext.authorizer?.claims['cognito:groups'];
        // if (!groups || !groups.includes('Admins')) ...

        // Scan all disputes (for MVP)
        const result = await docClient.send(new ScanCommand({
            TableName: DISPUTES_TABLE
        }));

        // Sort by date desc
        const disputes = (result.Items || []).sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify({ disputes })
        };

    } catch (error) {
        console.error(error);
        return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Internal Error' }) };
    }
};
