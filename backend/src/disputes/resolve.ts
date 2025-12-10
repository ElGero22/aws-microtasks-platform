import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { CORS_HEADERS } from '../shared/cors';
import { SubmissionService } from '../shared/submission-service';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

// Env vars
const DISPUTES_TABLE = process.env.DISPUTES_TABLE!;
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
    try {
        const body = JSON.parse(event.body || '{}');
        const { disputeId, decision, adminNotes } = body;

        if (!disputeId || !decision) {
            return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Missing fields' }) };
        }

        // 1. Get Dispute
        const disputeResult = await docClient.send(new GetCommand({
            TableName: DISPUTES_TABLE,
            Key: { disputeId }
        }));

        if (!disputeResult.Item) {
            return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Dispute not found' }) };
        }

        const dispute = disputeResult.Item;
        if (dispute.status !== 'OPEN') {
            return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Dispute already resolved' }) };
        }

        // 2. Process Decision
        if (decision === 'APPROVE' || decision === 'PARTIAL') {
            // Admin approves worker appeal -> Approve or Partial Submission
            await submissionService.reviewSubmission({
                submissionId: dispute.submissionId,
                decision: decision,
                reason: `Dispute Resolved: ${adminNotes || (decision === 'PARTIAL' ? 'Admin Partial Approval' : 'Admin Approved')}`,
                isAdmin: true
            });
        }
        // If REJECT, we just close the dispute, submission remains REJECTED.

        // 3. Update Dispute Status
        await docClient.send(new UpdateCommand({
            TableName: DISPUTES_TABLE,
            Key: { disputeId },
            UpdateExpression: 'set #status = :status, adminNotes = :notes, resolvedAt = :resolvedAt',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
                ':status': decision === 'APPROVE' ? 'RESOLVED_APPROVED' : (decision === 'PARTIAL' ? 'RESOLVED_PARTIAL' : 'RESOLVED_REJECTED'),
                ':notes': adminNotes || '',
                ':resolvedAt': new Date().toISOString()
            }
        }));

        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: 'Dispute resolved' })
        };

    } catch (error) {
        console.error(error);
        return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Internal Error' }) };
    }
};
