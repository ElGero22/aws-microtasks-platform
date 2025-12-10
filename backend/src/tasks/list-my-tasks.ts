import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const s3Client = new S3Client({});
const TASKS_TABLE = process.env.TASKS_TABLE || '';
const SUBMISSIONS_TABLE = process.env.SUBMISSIONS_TABLE || '';
const MEDIA_BUCKET = process.env.MEDIA_BUCKET || '';

/**
 * Generate a presigned URL for S3 object download
 */
async function signMediaUrl(mediaUrl: string | undefined): Promise<string | undefined> {
    if (!mediaUrl || !MEDIA_BUCKET) return mediaUrl;

    // Check if it's already a full URL from our bucket
    let key = mediaUrl;
    const bucketUrl = `https://${MEDIA_BUCKET}.s3.amazonaws.com/`;
    if (mediaUrl.startsWith(bucketUrl)) {
        key = mediaUrl.substring(bucketUrl.length);
    } else if (!mediaUrl.startsWith('media/')) {
        // Not a key we should sign
        return mediaUrl;
    }

    try {
        const command = new GetObjectCommand({ Bucket: MEDIA_BUCKET, Key: key });
        return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    } catch (error) {
        console.error('Error signing media URL:', error);
        return mediaUrl;
    }
}

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        // Get workerId from authorizer context
        const workerId = event.requestContext.authorizer?.claims?.sub;

        if (!workerId) {
            return {
                statusCode: 401,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': true,
                },
                body: JSON.stringify({ message: 'Unauthorized' }),
            };
        }

        // 1. Query tasks assigned to this worker
        const assignedTasksPromise = docClient.send(new QueryCommand({
            TableName: TASKS_TABLE,
            IndexName: 'AssignedToIndex',
            KeyConditionExpression: 'assignedTo = :workerId',
            ExpressionAttributeValues: {
                ':workerId': workerId,
            },
        }));

        // 2. Query REJECTED submissions for this worker
        // This allows us to show tasks that were rejected even if they are no longer assigned
        const rejectedSubmissionsPromise = docClient.send(new QueryCommand({
            TableName: SUBMISSIONS_TABLE,
            IndexName: 'byWorker',
            KeyConditionExpression: 'workerId = :workerId',
            FilterExpression: '#status = :rejected',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
                ':workerId': workerId,
                ':rejected': 'REJECTED'
            }
        }));

        const [assignedResponse, rejectedResponse] = await Promise.all([assignedTasksPromise, rejectedSubmissionsPromise]);

        let allTasks = assignedResponse.Items || [];
        const rejectedItems = rejectedResponse.Items || [];

        // 3. Fetch Task details for rejected submissions if not already in the list
        if (rejectedItems.length > 0) {
            // Filter out tasks we already have (in case logic overlaps or duplicate)
            const existingTaskIds = new Set(allTasks.map(t => t.taskId));
            const tasksToFetch = rejectedItems
                .map(sub => sub.taskId)
                .filter(tid => !existingTaskIds.has(tid));

            // Deduplicate task IDs
            const uniqueTaskIds = [...new Set(tasksToFetch)];

            if (uniqueTaskIds.length > 0) {
                // BatchGet only supports 100 items at a time, loop if necessary (omitted for brevity, assuming <100 rejected active tasks)
                // Also, keys must be { taskId: ... }
                const keys = uniqueTaskIds.map(tid => ({ taskId: tid }));

                // Breaking into chunks of 100
                const chunks = [];
                for (let i = 0; i < keys.length; i += 100) {
                    chunks.push(keys.slice(i, i + 100));
                }

                for (const chunk of chunks) {
                    const batchResult = await docClient.send(new BatchGetCommand({
                        RequestItems: {
                            [TASKS_TABLE]: {
                                Keys: chunk
                            }
                        }
                    }));

                    if (batchResult.Responses && batchResult.Responses[TASKS_TABLE]) {
                        const fetchedTasks = batchResult.Responses[TASKS_TABLE];
                        // Hydrate these tasks with the rejected status for the viewer context if needed
                        // But wait, the Frontend uses task.status. 
                        // If we fetch the task from DB, it might be 'AVAILABLE'. 
                        // The frontend expects 'REJECTED' to show the red border.
                        // We must OVERRIDE the status to 'REJECTED' for these specific tasks in this specific view.

                        const processedRejectedTasks = fetchedTasks.map(task => ({
                            ...task,
                            status: 'REJECTED', // Override status for Worker View
                            // Attach submissionId if possible to help with appeal?
                            // Frontend might utilize it. Optimally we find the submission ID again.
                            submissionId: rejectedItems.find(sub => sub.taskId === task.taskId)?.submissionId,
                            // Also pass the rejection feedback
                            feedback: rejectedItems.find(sub => sub.taskId === task.taskId)?.feedback
                        }));

                        allTasks = [...allTasks, ...processedRejectedTasks];
                    }
                }
            } else {
                // Even if we have the task, if it was in the "Assigned" list but also rejected (shouldn't happen if unassigned), 
                // we might want to ensure feedback is attached.
            }
        }

        // Sign media URLs for all tasks
        const tasksWithSignedUrls = await Promise.all(
            allTasks.map(async (task: Record<string, unknown>) => ({
                ...task,
                mediaUrl: await signMediaUrl(task.mediaUrl as string | undefined)
            }))
        );

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true,
            },
            body: JSON.stringify({ tasks: tasksWithSignedUrls }),
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
