import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as path from 'path';


interface PythonLambdaStackProps extends cdk.StackProps {
    tasksTable: dynamodb.Table;
    submissionsTable: dynamodb.Table;
    walletTable: dynamodb.Table;
    disputesTable: dynamodb.Table;
    transactionsTable: dynamodb.Table;
    assignmentsTable: dynamodb.Table;
    workersTable: dynamodb.Table;
    submissionQueue: sqs.Queue;
    disputeStateMachine: sfn.StateMachine;
    mediaBucket?: s3.Bucket;  // Optional: for AI services
}

export class PythonLambdaStack extends cdk.Stack {
    // Task handlers
    public readonly createTaskBatchLambda: lambda.Function;
    public readonly publishTaskBatchLambda: lambda.Function;
    public readonly listTasksLambda: lambda.Function;
    public readonly listAvailableTasksLambda: lambda.Function;
    public readonly assignTaskLambda: lambda.Function;
    public readonly processTranscriptionLambda: lambda.Function;
    public readonly expireAssignmentsLambda: lambda.Function;

    // Submission handlers
    public readonly submitWorkLambda: lambda.Function;

    // QC handlers
    public readonly validateSubmissionLambda: lambda.Function;

    // Dispute handlers
    public readonly startDisputeLambda: lambda.Function;
    public readonly resolveDisputeLambda: lambda.Function;
    public readonly adminReviewLambda: lambda.Function;
    public readonly autoResolveDisputesLambda: lambda.Function;

    // Payment handlers
    public readonly processPaymentLambda: lambda.Function;

    // Wallet handlers
    public readonly getWalletLambda: lambda.Function;
    public readonly depositFundsLambda: lambda.Function;
    public readonly withdrawFundsLambda: lambda.Function;

    // Worker/Gamification handlers
    public readonly updateWorkerStatsLambda: lambda.Function;

    constructor(scope: Construct, id: string, props: PythonLambdaStackProps) {
        super(scope, id, props);

        // Common environment variables for all lambdas
        const commonEnv: { [key: string]: string } = {
            TASKS_TABLE: props.tasksTable.tableName,
            SUBMISSIONS_TABLE: props.submissionsTable.tableName,
            WALLETS_TABLE: props.walletTable.tableName,
            DISPUTES_TABLE: props.disputesTable.tableName,
            TRANSACTIONS_TABLE: props.transactionsTable.tableName,
            ASSIGNMENTS_TABLE: props.assignmentsTable.tableName,
            WORKERS_TABLE: props.workersTable.tableName,
            SUBMISSION_QUEUE_URL: props.submissionQueue.queueUrl,
            DISPUTE_STATE_MACHINE_ARN: props.disputeStateMachine.stateMachineArn,
        };

        // Add MEDIA_BUCKET if provided (for AI services)
        if (props.mediaBucket) {
            commonEnv.MEDIA_BUCKET = props.mediaBucket.bucketName;
        }

        // Lambda layer for shared code
        // AWS Lambda expects Python packages in a 'python/' subdirectory
        const sharedLayer = new lambda.LayerVersion(this, 'SharedLayer', {
            code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/layer')),
            compatibleRuntimes: [lambda.Runtime.PYTHON_3_11],
            description: 'Shared utilities for Python handlers',
        });

        // Helper function to create Python Lambda
        const createPythonLambda = (
            id: string,
            handlerPath: string,
            handlerFile: string,
            additionalEnv?: { [key: string]: string }
        ): lambda.Function => {
            return new lambda.Function(this, id, {
                runtime: lambda.Runtime.PYTHON_3_11,
                handler: `${handlerFile}.handler`,
                code: lambda.Code.fromAsset(path.join(__dirname, `../../backend/src/handlers/${handlerPath}`)),
                environment: { ...commonEnv, ...additionalEnv },
                layers: [sharedLayer],
                timeout: cdk.Duration.seconds(30),
            });
        };

        // ============ Task Handlers ============

        this.createTaskBatchLambda = createPythonLambda(
            'CreateTaskBatchFn',
            'tasks',
            'create_task_batch'
        );
        props.tasksTable.grantWriteData(this.createTaskBatchLambda);

        // Transcribe permissions for audio task creation
        this.createTaskBatchLambda.addToRolePolicy(new iam.PolicyStatement({
            actions: ['transcribe:StartTranscriptionJob'],
            resources: ['*'],
        }));
        if (props.mediaBucket) {
            props.mediaBucket.grantRead(this.createTaskBatchLambda);
        }

        this.publishTaskBatchLambda = createPythonLambda(
            'PublishTaskBatchFn',
            'tasks',
            'publish_task_batch'
        );
        props.tasksTable.grantReadWriteData(this.publishTaskBatchLambda);
        props.submissionQueue.grantSendMessages(this.publishTaskBatchLambda);

        this.listTasksLambda = createPythonLambda(
            'ListTasksFn',
            'tasks',
            'list_tasks'
        );
        props.tasksTable.grantReadData(this.listTasksLambda);

        this.listAvailableTasksLambda = createPythonLambda(
            'ListAvailableTasksFn',
            'tasks',
            'list_available_tasks'
        );
        props.tasksTable.grantReadData(this.listAvailableTasksLambda);
        props.workersTable.grantReadData(this.listAvailableTasksLambda);  // For level filtering

        this.assignTaskLambda = createPythonLambda(
            'AssignTaskFn',
            'tasks',
            'assign_task'
        );
        props.tasksTable.grantReadWriteData(this.assignTaskLambda);
        props.assignmentsTable.grantWriteData(this.assignTaskLambda);

        // Process Transcription Handler (triggered by EventBridge)
        this.processTranscriptionLambda = createPythonLambda(
            'ProcessTranscriptionFn',
            'tasks',
            'process_transcription'
        );
        props.tasksTable.grantReadWriteData(this.processTranscriptionLambda);

        // Transcribe permissions to read job results
        this.processTranscriptionLambda.addToRolePolicy(new iam.PolicyStatement({
            actions: ['transcribe:GetTranscriptionJob'],
            resources: ['*'],
        }));
        if (props.mediaBucket) {
            props.mediaBucket.grantRead(this.processTranscriptionLambda);
        }

        // EventBridge Rule: Trigger when Transcribe jobs complete/fail
        // Defined here to avoid circular dependency with WorkflowStack
        const transcribeEventRule = new events.Rule(this, 'TranscribeJobCompleteRule', {
            ruleName: 'transcribe-job-state-change',
            description: 'Trigger processTranscriptionLambda when Transcribe jobs complete or fail',
            eventPattern: {
                source: ['aws.transcribe'],
                detailType: ['Transcribe Job State Change'],
                detail: {
                    TranscriptionJobStatus: ['COMPLETED', 'FAILED']
                }
            }
        });
        transcribeEventRule.addTarget(
            new targets.LambdaFunction(this.processTranscriptionLambda, {
                retryAttempts: 2
            })
        );

        // ============ Submission Handlers ============

        this.submitWorkLambda = createPythonLambda(
            'SubmitWorkFn',
            'submissions',
            'submit_work'
        );
        props.tasksTable.grantReadWriteData(this.submitWorkLambda);
        props.submissionsTable.grantWriteData(this.submitWorkLambda);
        props.assignmentsTable.grantReadWriteData(this.submitWorkLambda);
        props.submissionQueue.grantSendMessages(this.submitWorkLambda);

        // ============ QC Handlers ============

        this.validateSubmissionLambda = createPythonLambda(
            'ValidateSubmissionFn',
            'qc',
            'validate_submission'
        );
        props.tasksTable.grantReadWriteData(this.validateSubmissionLambda);  // ReadWrite for updating transcription
        props.submissionsTable.grantReadWriteData(this.validateSubmissionLambda);

        // EventBridge put events
        this.validateSubmissionLambda.addToRolePolicy(new iam.PolicyStatement({
            actions: ['events:PutEvents'],
            resources: ['*'],
        }));

        // Amazon Rekognition permissions for image classification
        this.validateSubmissionLambda.addToRolePolicy(new iam.PolicyStatement({
            actions: ['rekognition:DetectLabels', 'rekognition:DetectText'],
            resources: ['*'],
        }));

        // Amazon Transcribe permissions for reading transcription results
        this.validateSubmissionLambda.addToRolePolicy(new iam.PolicyStatement({
            actions: ['transcribe:GetTranscriptionJob'],
            resources: ['*'],
        }));

        // Amazon SageMaker permissions (optional - for custom models)
        this.validateSubmissionLambda.addToRolePolicy(new iam.PolicyStatement({
            actions: ['sagemaker:InvokeEndpoint'],
            resources: ['*'],
        }));

        // S3 read access for media files
        if (props.mediaBucket) {
            props.mediaBucket.grantRead(this.validateSubmissionLambda);
        }

        // SQS trigger for QC
        this.validateSubmissionLambda.addEventSource(
            new lambdaEventSources.SqsEventSource(props.submissionQueue)
        );

        // ============ Dispute Handlers ============

        this.startDisputeLambda = createPythonLambda(
            'StartDisputeFn',
            'disputes',
            'start_dispute'
        );
        props.submissionsTable.grantReadWriteData(this.startDisputeLambda);
        props.disputesTable.grantWriteData(this.startDisputeLambda);
        props.disputeStateMachine.grantStartExecution(this.startDisputeLambda);

        this.resolveDisputeLambda = createPythonLambda(
            'ResolveDisputeFn',
            'disputes',
            'resolve_dispute'
        );
        props.submissionsTable.grantReadWriteData(this.resolveDisputeLambda);
        props.disputesTable.grantReadWriteData(this.resolveDisputeLambda);

        // ============ Payment Handlers ============

        this.processPaymentLambda = createPythonLambda(
            'ProcessPaymentFn',
            'payments',
            'process_payment'
        );
        props.tasksTable.grantReadData(this.processPaymentLambda);
        props.walletTable.grantReadWriteData(this.processPaymentLambda);
        props.transactionsTable.grantWriteData(this.processPaymentLambda);

        // Allow SES for notifications
        this.processPaymentLambda.addToRolePolicy(new iam.PolicyStatement({
            actions: ['ses:SendEmail'],
            resources: ['*'],
        }));

        // DynamoDB Stream trigger for payments (when submission approved)
        this.processPaymentLambda.addEventSource(
            new lambdaEventSources.DynamoEventSource(props.submissionsTable, {
                startingPosition: lambda.StartingPosition.TRIM_HORIZON,
                batchSize: 10,
                retryAttempts: 3,
            })
        );

        // ============ Wallet Handlers ============

        this.getWalletLambda = createPythonLambda(
            'GetWalletFn',
            'wallet',
            'get_wallet'
        );
        props.walletTable.grantReadData(this.getWalletLambda);

        this.depositFundsLambda = createPythonLambda(
            'DepositFundsFn',
            'wallet',
            'deposit_funds'
        );
        props.walletTable.grantReadWriteData(this.depositFundsLambda);
        props.transactionsTable.grantWriteData(this.depositFundsLambda);

        this.withdrawFundsLambda = createPythonLambda(
            'WithdrawFundsFn',
            'wallet',
            'withdraw_funds'
        );
        props.walletTable.grantReadWriteData(this.withdrawFundsLambda);
        props.transactionsTable.grantWriteData(this.withdrawFundsLambda);
        // SES permission for email notifications
        this.withdrawFundsLambda.addToRolePolicy(new iam.PolicyStatement({
            actions: ['ses:SendEmail'],
            resources: ['*'],
        }));

        // ============ Worker/Gamification Handlers ============

        this.updateWorkerStatsLambda = createPythonLambda(
            'UpdateWorkerStatsFn',
            'workers',
            'update_worker_stats'
        );
        props.workersTable.grantReadWriteData(this.updateWorkerStatsLambda);
        props.tasksTable.grantReadData(this.updateWorkerStatsLambda);

        // DynamoDB Stream trigger: process Approved/Rejected submissions
        this.updateWorkerStatsLambda.addEventSource(
            new lambdaEventSources.DynamoEventSource(props.submissionsTable, {
                startingPosition: lambda.StartingPosition.TRIM_HORIZON,
                batchSize: 10,
                retryAttempts: 3,
                filters: [
                    lambda.FilterCriteria.filter({
                        eventName: lambda.FilterRule.isEqual('MODIFY'),
                    }),
                ],
            })
        );

        // ============ Additional Dispute Handlers ============

        this.adminReviewLambda = createPythonLambda(
            'AdminReviewFn',
            'disputes',
            'admin_review'
        );
        props.disputesTable.grantReadWriteData(this.adminReviewLambda);
        props.submissionsTable.grantReadWriteData(this.adminReviewLambda);

        this.autoResolveDisputesLambda = createPythonLambda(
            'AutoResolveDisputesFn',
            'disputes',
            'auto_resolve_disputes'
        );
        props.disputesTable.grantReadWriteData(this.autoResolveDisputesLambda);
        props.submissionsTable.grantReadWriteData(this.autoResolveDisputesLambda);

        // ============ Task Expiration Handler ============

        this.expireAssignmentsLambda = createPythonLambda(
            'ExpireAssignmentsFn',
            'tasks',
            'expire_assignments'
        );
        props.assignmentsTable.grantReadWriteData(this.expireAssignmentsLambda);
        props.tasksTable.grantReadWriteData(this.expireAssignmentsLambda);

        // ============ EventBridge Scheduled Rules ============

        // Rule: Expire stale assignments every 1 minute
        new events.Rule(this, 'ExpireAssignmentsRule', {
            ruleName: 'expire-stale-assignments',
            description: 'Expire task assignments older than 10 minutes',
            schedule: events.Schedule.rate(cdk.Duration.minutes(1)),
            targets: [new targets.LambdaFunction(this.expireAssignmentsLambda, {
                retryAttempts: 2,
            })],
        });

        // Rule: Auto-resolve disputes daily
        new events.Rule(this, 'AutoResolveDisputesRule', {
            ruleName: 'auto-resolve-disputes-daily',
            description: 'Auto-approve disputes older than 3 days',
            schedule: events.Schedule.rate(cdk.Duration.hours(24)),
            targets: [new targets.LambdaFunction(this.autoResolveDisputesLambda, {
                retryAttempts: 2,
            })],
        });
    }
}
