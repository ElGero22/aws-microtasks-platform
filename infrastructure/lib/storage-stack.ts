import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';

export class StorageStack extends cdk.Stack {
    public readonly mediaBucket: s3.Bucket;

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // S3 Bucket for media files (images, audio)
        this.mediaBucket = new s3.Bucket(this, 'MediaBucket', {
            bucketName: undefined, // Let CloudFormation generate unique name
            publicReadAccess: true,
            blockPublicAccess: {
                blockPublicAcls: false,
                blockPublicPolicy: false,
                ignorePublicAcls: false,
                restrictPublicBuckets: false,
            },
            cors: [
                {
                    allowedMethods: [
                        s3.HttpMethods.GET,
                        s3.HttpMethods.PUT,
                        s3.HttpMethods.POST,
                    ],
                    allowedOrigins: ['*'], // In production, restrict to your CloudFront domain
                    allowedHeaders: ['*'],
                    maxAge: 3000,
                },
            ],
            lifecycleRules: [
                {
                    // Delete incomplete multipart uploads after 1 day
                    abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
                },
            ],
            removalPolicy: cdk.RemovalPolicy.DESTROY, // For dev/test only
            autoDeleteObjects: true, // For dev/test only
        });

        // Output the bucket name
        new cdk.CfnOutput(this, 'MediaBucketName', {
            value: this.mediaBucket.bucketName,
            description: 'S3 Bucket for media files',
        });

        new cdk.CfnOutput(this, 'MediaBucketUrl', {
            value: this.mediaBucket.bucketWebsiteUrl,
            description: 'S3 Bucket URL',
        });
    }
}
