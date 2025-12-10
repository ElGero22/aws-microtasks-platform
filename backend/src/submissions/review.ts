import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { CORS_HEADERS } from '../shared/cors';
import { SubmissionService } from '../shared/submission-service';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

// Environment variables
const SUBMISSIONS_TABLE = process.env.SUBMISSIONS_TABLE!;
const TASKS_TABLE = process.env.TASKS_TABLE!;
const WALLET_TABLE = process.env.WALLET_TABLE!;
const TRANSACTIONS_TABLE = process.env.TRANSACTIONS_TABLE!;
const WORKERS_TABLE = process.env.WORKERS_TABLE!;

const submissionService = new SubmissionService(docClient, {
    SUBMISSIONS_TABLE,
    TASKS_TABLE,
    WALLET_TABLE,
    TRANSACTIONS_TABLE,
    WORKERS_TABLE
});

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

        const requesterId = event.requestContext.authorizer.claims.sub;
        const submissionId = event.pathParameters?.submissionId;
        const body = JSON.parse(event.body || '{}');
        const { decision, reason } = body;

        if (!submissionId || !decision || !['APPROVE', 'REJECT'].includes(decision)) {
            return {
                statusCode: 400,
                headers: CORS_HEADERS,
                body: JSON.stringify({ message: 'Invalid request' }),
            };
        }

        const result = await submissionService.reviewSubmission({
            submissionId,
            decision,
            reason,
            requesterId
        });

        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: `Submission ${result.status}`, submissionId }),
        };

    } catch (error: any) {
        console.error('Error reviewing submission:', error);

        let statusCode = 500;
        if (error.message === 'Submission not found' || error.message === 'Task not found') {
            statusCode = 404;
        } else if (error.message === 'Unauthorized') {
            statusCode = 403;
        }

        return {
            statusCode,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: error.message || 'Internal Server Error' }),
        };
    }
};
