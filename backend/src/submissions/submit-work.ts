import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { v4 as uuidv4 } from 'uuid';

const dbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dbClient);
const sqsClient = new SQSClient({});
const sesClient = new SESClient({});

const SUBMISSIONS_TABLE = process.env.SUBMISSIONS_TABLE || '';
const TASKS_TABLE = process.env.TASKS_TABLE || '';
const REQUESTERS_TABLE = process.env.REQUESTERS_TABLE || '';
const SUBMISSION_QUEUE_URL = process.env.SUBMISSION_QUEUE_URL || '';
const SENDER_EMAIL = 'no-reply@microtasks.com'; // In production, this must be a verified sender

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
        const { taskId, workerId, mediaUrl } = body;

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
        };

        // 1. Save to Submissions Table
        await docClient.send(new PutCommand({
            TableName: SUBMISSIONS_TABLE,
            Item: submission,
        }));

        // 2. Update Task Status and Notify Requester
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

            // --- NOTIFICATION LOGIC ---
            if (REQUESTERS_TABLE) {
                // A. Get Task to find Creator
                const taskResult = await docClient.send(new GetCommand({
                    TableName: TASKS_TABLE,
                    Key: { taskId }
                }));
                const task = taskResult.Item;
                const requesterId = task?.requesterId;

                if (requesterId) {
                    // B. Get Requester Email
                    const reqResult = await docClient.send(new GetCommand({
                        TableName: REQUESTERS_TABLE,
                        Key: { requesterId }
                    }));
                    const requesterEmail = reqResult.Item?.email;

                    // Get Worker Name
                    let workerName = 'Unknown Worker';
                    if (process.env.WORKERS_TABLE) {
                        try {
                            const workerResult = await docClient.send(new GetCommand({
                                TableName: process.env.WORKERS_TABLE,
                                Key: { workerId }
                            }));
                            if (workerResult.Item && workerResult.Item.name) {
                                workerName = workerResult.Item.name;
                            }
                        } catch (e) {
                            console.log('Error fetching worker name', e);
                        }
                    }


                    // C. Send SES Email (if email exists)
                    if (requesterEmail) {
                        console.log(`Sending notification to ${requesterEmail}`);
                        await sesClient.send(new SendEmailCommand({
                            Source: SENDER_EMAIL, // Must be verified in Sandbox
                            Destination: { ToAddresses: [requesterEmail] },
                            Message: {
                                Subject: { Data: `Nueva entrega para tu tarea: ${task.title}` },
                                Body: {
                                    Text: { Data: `El trabajador "${workerName}" (ID: ${workerId.substring(0, 8)}) ha enviado una entrega para tu tarea "${task.title}".\n\nDetalles de la entrega:\n${body.content || 'Sin contenido de texto (posiblemente archivo adjunto)'}\n\nPor favor inicia sesión en tu panel para revisar, aprobar o declinar esta entrega.\n\nhttps://d34wzbmshv26k4.cloudfront.net/requester/my-tasks` }
                                }
                            }
                        }));
                    } else {
                        console.log('No requester email found for notification.');
                    }
                }
            }
            // --------------------------

        } catch (updateError) {
            console.error('Failed to update task status or notify:', updateError);
            // Non-critical failure for notification, continue
        }

        // 3. Send to SQS for QC validation (AI validation with Rekognition/Transcribe)
        if (SUBMISSION_QUEUE_URL) {
            try {
                await sqsClient.send(new SendMessageCommand({
                    QueueUrl: SUBMISSION_QUEUE_URL,
                    MessageBody: JSON.stringify({
                        submissionId,
                        taskId,
                        workerId,
                        answer: body.content || body.answer || '',
                    }),
                }));
                console.log(`Sent submission ${submissionId} to QC queue`);
            } catch (sqsError) {
                console.error('Failed to send to SQS:', sqsError);
                // Non-critical - continue even if SQS fails
            }
        }

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
