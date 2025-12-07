import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { v4 as uuidv4 } from 'uuid';

const dbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dbClient);
const sqsClient = new SQSClient({});

const SUBMISSIONS_TABLE = process.env.SUBMISSIONS_TABLE || '';
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
        const submissionId = uuidv4();
        const timestamp = new Date().toISOString();

        const submission = {
            submissionId,
            ...body,
            submittedAt: timestamp,
            status: 'PENDING_QC',
        };

        // Save to DynamoDB
        await docClient.send(new PutCommand({
            TableName: SUBMISSIONS_TABLE,
            Item: submission,
        }));

        // Send to SQS for QC
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
