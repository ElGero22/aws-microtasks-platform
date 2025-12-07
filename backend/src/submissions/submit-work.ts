import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { v4 as uuidv4 } from 'uuid';

const dbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dbClient);
const sqsClient = new SQSClient({});

const SUBMISSIONS_TABLE = process.env.SUBMISSIONS_TABLE || '';
const TASKS_TABLE = process.env.TASKS_TABLE || '';
const SUBMISSION_QUEUE_URL = process.env.SUBMISSION_QUEUE_URL || '';

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
        const { taskId, workerId, mediaUrl } = body; // Extract mediaUrl

        if (!taskId || !workerId) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': true,
                },
                body: JSON.stringify({ message: 'Missing taskId or workerId' })
            };
        }

        const submissionId = uuidv4();
        const timestamp = new Date().toISOString();

        const submission = {
            submissionId,
            ...body,
            submittedAt: timestamp,
            status: 'PENDING_QC',
            // mediaUrl will be included via ...body if present
        };

        // 1. Save to Submissions Table
        await docClient.send(new PutCommand({
            TableName: SUBMISSIONS_TABLE,
            Item: submission,
        }));

        // 2. Update Task Status to SUBMITTED
        // We use a condition to ensure the task is still assigned to this worker
        try {
            await docClient.send(new UpdateCommand({
                TableName: TASKS_TABLE,
                Key: { taskId },
                UpdateExpression: 'set #status = :submitted',
                ConditionExpression: 'assignedTo = :workerId',
                ExpressionAttributeNames: {
                    '#status': 'status'
                },
                ExpressionAttributeValues: {
                    ':submitted': 'SUBMITTED',
                    ':workerId': workerId
                }
            }));
        } catch (updateError) {
            console.error('Failed to update task status:', updateError);
            // We succeed with the submission but log the error. 
            // In a strict financial system we might want to rollback the submission, 
            // but for this MVP catching it is safer to avoid blocking the user if there's a race condition.
        }

        // 3. Send to SQS for QC
        await sqsClient.send(new SendMessageCommand({
            QueueUrl: SUBMISSION_QUEUE_URL,
            MessageBody: JSON.stringify({ submissionId }),
        }));

        return {
            statusCode: 201,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true,
            },
            body: JSON.stringify(submission),
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
