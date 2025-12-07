import { SQSHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const dbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dbClient);
const SUBMISSIONS_TABLE = process.env.SUBMISSIONS_TABLE || '';

export const handler: SQSHandler = async (event) => {
    for (const record of event.Records) {
        try {
            const { submissionId } = JSON.parse(record.body);
            console.log(`Processing submission: ${submissionId}`);

            // Mock QC Logic: Randomly approve or reject
            // In real app, call Rekognition/Transcribe here
            const isApproved = Math.random() > 0.2; // 80% approval rate
            const status = isApproved ? 'APPROVED' : 'REJECTED';

            await docClient.send(new UpdateCommand({
                TableName: SUBMISSIONS_TABLE,
                Key: { submissionId },
                UpdateExpression: 'set #status = :status, qcProcessedAt = :time',
                ExpressionAttributeNames: {
                    '#status': 'status',
                },
                ExpressionAttributeValues: {
                    ':status': status,
                    ':time': new Date().toISOString(),
                },
            }));

            console.log(`Submission ${submissionId} processed. Status: ${status}`);
        } catch (error) {
            console.error(`Error processing record ${record.messageId}:`, error);
            // Throwing error will cause SQS to retry (and eventually move to DLQ)
            throw error;
        }
    }
};
