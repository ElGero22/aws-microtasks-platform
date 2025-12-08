import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'path';

interface WorkflowStackProps extends cdk.StackProps {
    submissionsTable?: dynamodb.Table;
    disputesTable?: dynamodb.Table;
}

export class WorkflowStack extends cdk.Stack {
    public readonly submissionQueue: sqs.Queue;
    public readonly deadLetterQueue: sqs.Queue;
    public readonly disputeStateMachine: sfn.StateMachine;
    public readonly adminNotificationTopic: sns.Topic;

    constructor(scope: Construct, id: string, props?: WorkflowStackProps) {
        super(scope, id, props);

        // Dead Letter Queue
        this.deadLetterQueue = new sqs.Queue(this, 'DeadLetterQueue', {
            retentionPeriod: cdk.Duration.days(14),
        });

        // Submission Queue for QC decoupling
        this.submissionQueue = new sqs.Queue(this, 'SubmissionQueue', {
            visibilityTimeout: cdk.Duration.seconds(300),
            deadLetterQueue: {
                queue: this.deadLetterQueue,
                maxReceiveCount: 3,
            },
        });

        // SNS Topic for admin notifications
        this.adminNotificationTopic = new sns.Topic(this, 'AdminNotificationTopic', {
            topicName: 'dispute-admin-notifications',
            displayName: 'Dispute Resolution Admin Alerts',
        });

        // ============================================================
        // STEP FUNCTIONS EXPRESS WORKFLOW FOR DISPUTE RESOLUTION
        // ============================================================
        // Note: Express workflows have max 5 min execution time.
        // For 3-day timeout, we use EventBridge scheduler instead.

        // Define workflow states
        const logDisputeStart = new sfn.Pass(this, 'LogDisputeStart', {
            result: sfn.Result.fromObject({ message: 'Dispute workflow started' }),
            resultPath: '$.log',
        });

        // Notify admin via SNS
        const notifyAdmin = new tasks.SnsPublish(this, 'NotifyAdmin', {
            topic: this.adminNotificationTopic,
            message: sfn.TaskInput.fromJsonPathAt('States.Format(\'New dispute {} requires review. Submission: {}\', $.disputeId, $.submissionId)'),
            subject: '⚠️ New Dispute Requires Review',
            resultPath: '$.notificationResult',
        });

        // Record notification sent
        const recordNotification = new sfn.Pass(this, 'RecordNotification', {
            parameters: {
                'disputeId.$': '$.disputeId',
                'submissionId.$': '$.submissionId',
                'notified': true,
                'notifiedAt.$': '$$.State.EnteredTime',
                'status': 'AWAITING_REVIEW'
            },
        });

        // Success state
        const disputeQueued = new sfn.Succeed(this, 'DisputeQueued', {
            comment: 'Dispute has been queued for admin review. Auto-resolve handled by EventBridge.'
        });

        // Error handler
        const handleError = new sfn.Fail(this, 'HandleError', {
            error: 'DisputeProcessingError',
            cause: 'Failed to process dispute notification'
        });

        // Build the workflow
        const definition = logDisputeStart
            .next(notifyAdmin)
            .next(recordNotification)
            .next(disputeQueued);

        // Add catch for errors
        notifyAdmin.addCatch(handleError, {
            errors: ['States.ALL'],
            resultPath: '$.error'
        });

        // Create Express State Machine (cheaper, faster, max 5 min)
        this.disputeStateMachine = new sfn.StateMachine(this, 'DisputeResolution', {
            stateMachineName: 'DisputeResolutionWorkflow',
            stateMachineType: sfn.StateMachineType.EXPRESS,
            definition: definition,
            timeout: cdk.Duration.minutes(5),
            tracingEnabled: true,
            logs: {
                destination: new logs.LogGroup(this, 'DisputeWorkflowLogs', {
                    logGroupName: '/aws/stepfunctions/dispute-resolution',
                    removalPolicy: cdk.RemovalPolicy.DESTROY,
                    retention: logs.RetentionDays.ONE_WEEK,
                }),
                level: sfn.LogLevel.ALL,
            },
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

        // Output the state machine ARN
        new cdk.CfnOutput(this, 'DisputeStateMachineArn', {
            value: this.disputeStateMachine.stateMachineArn,
            description: 'ARN of the Dispute Resolution State Machine'
        });

        new cdk.CfnOutput(this, 'AdminNotificationTopicArn', {
            value: this.adminNotificationTopic.topicArn,
            description: 'ARN of the Admin Notification SNS Topic'
        });
    }
}
