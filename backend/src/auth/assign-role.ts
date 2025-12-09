import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const WORKERS_TABLE = process.env.WORKERS_TABLE!;
const REQUESTERS_TABLE = process.env.REQUESTERS_TABLE!;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': true,
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'OPTIONS,POST',
};

export const handler: APIGatewayProxyHandler = async (event) => {
    // Handle OPTIONS request for CORS
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: '',
        };
    }

    try {
        if (!event.body) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'Missing request body' }),
            };
        }

        const { role } = JSON.parse(event.body);

        if (!['worker', 'requester'].includes(role)) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'Invalid role. Must be "worker" or "requester".' }),
            };
        }

        // Get user info from Cognito Authorizer claims
        const claims = event.requestContext.authorizer?.claims;
        if (!claims) {
            return {
                statusCode: 401,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'Unauthorized' }),
            };
        }

        const userId = claims.sub;
        const email = claims.email;
        // Cognito specific: preferred_username or name might be populated depending on how user signed up
        const name = claims.name || claims.preferred_username || email.split('@')[0];

        console.log(`Assigning role ${role} to user ${userId} (${email})`);

        if (role === 'worker') {
            // Check if worker already exists
            const existing = await docClient.send(new GetCommand({
                TableName: WORKERS_TABLE,
                Key: { workerId: userId }
            }));

            if (!existing.Item) {
                const newWorker = {
                    workerId: userId,
                    email: email,
                    name: name,
                    role: 'worker',
                    joinedAt: new Date().toISOString(),
                    earnings: 0,
                    tasksCompleted: 0,
                    accuracy: 100, // Initial accuracy
                    level: 'Novice'
                };
                await docClient.send(new PutCommand({
                    TableName: WORKERS_TABLE,
                    Item: newWorker
                }));
                console.log('Created new worker profile');
            } else {
                console.log('Worker profile already exists');
            }
        } else if (role === 'requester') {
            // Check if requester already exists
            const existing = await docClient.send(new GetCommand({
                TableName: REQUESTERS_TABLE,
                Key: { requesterId: userId }
            }));

            if (!existing.Item) {
                const newRequester = {
                    requesterId: userId,
                    email: email,
                    name: name,
                    role: 'requester',
                    joinedAt: new Date().toISOString(),
                    totalSpent: 0,
                    tasksPublished: 0
                };
                await docClient.send(new PutCommand({
                    TableName: REQUESTERS_TABLE,
                    Item: newRequester
                }));
                console.log('Created new requester profile');
            } else {
                console.log('Requester profile already exists');
            }

            // ALSO ensure they have a Worker profile so they appear in Leaderboards
            const existingWorker = await docClient.send(new GetCommand({
                TableName: WORKERS_TABLE,
                Key: { workerId: userId }
            }));

            if (!existingWorker.Item) {
                const newWorker = {
                    workerId: userId,
                    email: email,
                    name: name,
                    role: 'requester', // Identifying them as a requester in the worker table
                    joinedAt: new Date().toISOString(),
                    earnings: 0,
                    tasksCompleted: 0,
                    accuracy: 100,
                    level: 'Novice'
                };
                await docClient.send(new PutCommand({
                    TableName: WORKERS_TABLE,
                    Item: newWorker
                }));
                console.log('Created shadow worker profile for requester');
            }
        }

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ message: `Role ${role} assigned successfully` }),
        };

    } catch (error) {
        console.error('Error assigning role:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Internal Server Error' }),
        };
    }
};
