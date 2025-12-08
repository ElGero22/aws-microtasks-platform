import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const s3Client = new S3Client({});
const TASKS_TABLE = process.env.TASKS_TABLE || '';
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

        // Query tasks assigned to this worker
        // Note: This requires a GSI on assignedTo
        const command = new QueryCommand({
            TableName: TASKS_TABLE,
            IndexName: 'AssignedToIndex',
            KeyConditionExpression: 'assignedTo = :workerId',
            ExpressionAttributeValues: {
                ':workerId': workerId,
            },
        });

        const response = await docClient.send(command);

        // Sign media URLs for all tasks
        const tasks = response.Items || [];
        const tasksWithSignedUrls = await Promise.all(
            tasks.map(async (task: Record<string, unknown>) => ({
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
