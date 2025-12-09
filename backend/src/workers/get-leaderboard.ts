import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const WORKERS_TABLE = process.env.WORKERS_TABLE!;

export const handler: APIGatewayProxyHandler = async (event) => {
    console.log('Fetching leaderboard');

    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
    };

    try {
        // In a real app with many users, we would use a GSI with a static partition key for "Top Leaderboard"
        // or update a separate Leaderboard aggregate table.
        // For this scale, a Scan is acceptable but not optimal for production at scale.
        // We will scan and sort in memory for now.

        const command = new ScanCommand({
            TableName: WORKERS_TABLE,
        });

        const response = await docClient.send(command);
        const workers = response.Items || [];

        // Sort by earnings (desc), then accuracy (desc)
        workers.sort((a, b) => {
            const earningsA = parseFloat(a.earnings || '0');
            const earningsB = parseFloat(b.earnings || '0');
            if (earningsB !== earningsA) return earningsB - earningsA;

            const accuracyA = parseFloat(a.accuracy || '0');
            const accuracyB = parseFloat(b.accuracy || '0');
            return accuracyB - accuracyA;
        });

        // Take top 10
        const topWorkers = workers.slice(0, 10).map((worker, index) => ({
            rank: index + 1,
            workerId: worker.workerId,
            // We don't have names stored yet, so use a placeholder or partial ID
            name: worker.name || `Worker ${worker.workerId.substring(0, 5)}...`,
            earnings: parseFloat(worker.earnings || '0'),
            tasksCompleted: worker.tasksCompleted || 0,
            accuracy: parseFloat(worker.accuracy || '0') * 100 // Convert to percentage
        }));

        return {
            statusCode: 200,
            headers: headers,
            body: JSON.stringify({
                leaderboard: topWorkers
            }),
        };
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        return {
            statusCode: 500,
            headers: headers,
            body: JSON.stringify({ message: 'Internal Server Error' }),
        };
    }
};
