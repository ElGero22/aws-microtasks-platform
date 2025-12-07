import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as path from 'path';

interface WorkflowStackProps extends cdk.StackProps {
    submissionsTable?: dynamodb.Table;
}

export class WorkflowStack extends cdk.Stack {
    public readonly submissionQueue: sqs.Queue;
    public readonly deadLetterQueue: sqs.Queue;
    public readonly disputeStateMachine: sfn.StateMachine;

    constructor(scope: Construct, id: string, props?: WorkflowStackProps) {
        super(scope, id, props);

        // Dead Letter Queue
        this.deadLetterQueue = new sqs.Queue(this, 'DeadLetterQueue', {
            retentionPeriod: cdk.Duration.days(14),
        });

        // Submission Queue for QC decoupling
        this.submissionQueue = new sqs.Queue(this, 'SubmissionQueue', {
            visibilityTimeout: cdk.Duration.seconds(300), // Allow time for QC processing
            deadLetterQueue: {
                queue: this.deadLetterQueue,
                maxReceiveCount: 3,
            },
        });

        // Placeholder for Dispute Resolution State Machine
        this.disputeStateMachine = new sfn.StateMachine(this, 'DisputeResolution', {
            definition: new sfn.Pass(this, 'StartDisputeResolution'),
            timeout: cdk.Duration.minutes(5),
        });

        // QC Lambda (only if table is provided)
        if (props?.submissionsTable) {
            const qcLambda = new nodejs.NodejsFunction(this, 'ProcessSubmissionFunction', {
                runtime: lambda.Runtime.NODEJS_18_X,
                entry: path.join(__dirname, '../../backend/src/qc/process-submission.ts'),
                handler: 'handler',
                environment: {
                    SUBMISSIONS_TABLE: props.submissionsTable.tableName,
                },
            });
            props.submissionsTable.grantWriteData(qcLambda);

            // SQS Trigger
            qcLambda.addEventSource(new lambdaEventSources.SqsEventSource(this.submissionQueue));
        }
    }
}


