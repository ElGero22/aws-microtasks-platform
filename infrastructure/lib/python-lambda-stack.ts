import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as path from 'path';

interface PythonLambdaStackProps extends cdk.StackProps {
    tasksTable: dynamodb.Table;
    submissionsTable: dynamodb.Table;
    walletTable: dynamodb.Table;
    disputesTable: dynamodb.Table;
    transactionsTable: dynamodb.Table;
    assignmentsTable: dynamodb.Table;
    submissionQueue: sqs.Queue;
    disputeStateMachine: sfn.StateMachine;
}

export class PythonLambdaStack extends cdk.Stack {
    // Task handlers
    public readonly createTaskBatchLambda: lambda.Function;
    public readonly publishTaskBatchLambda: lambda.Function;
    public readonly listTasksLambda: lambda.Function;
    public readonly listAvailableTasksLambda: lambda.Function;
    public readonly assignTaskLambda: lambda.Function;

    // Submission handlers
    public readonly submitWorkLambda: lambda.Function;

    // QC handlers
    public readonly validateSubmissionLambda: lambda.Function;

    // Dispute handlers
    public readonly startDisputeLambda: lambda.Function;
    public readonly resolveDisputeLambda: lambda.Function;

    // Payment handlers
    public readonly processPaymentLambda: lambda.Function;

    // Wallet handlers
    public readonly getWalletLambda: lambda.Function;

    constructor(scope: Construct, id: string, props: PythonLambdaStackProps) {
        super(scope, id, props);

        // Common environment variables for all lambdas
        const commonEnv = {
            TASKS_TABLE: props.tasksTable.tableName,
            SUBMISSIONS_TABLE: props.submissionsTable.tableName,
            WALLETS_TABLE: props.walletTable.tableName,
            DISPUTES_TABLE: props.disputesTable.tableName,
            TRANSACTIONS_TABLE: props.transactionsTable.tableName,
            ASSIGNMENTS_TABLE: props.assignmentsTable.tableName,
            SUBMISSION_QUEUE_URL: props.submissionQueue.queueUrl,
            DISPUTE_STATE_MACHINE_ARN: props.disputeStateMachine.stateMachineArn,
        };

        // Lambda layer for shared code
        const sharedLayer = new lambda.LayerVersion(this, 'SharedLayer', {
            code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/src/shared')),
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

        this.assignTaskLambda = createPythonLambda(
            'AssignTaskFn',
            'tasks',
            'assign_task'
        );
        props.tasksTable.grantReadWriteData(this.assignTaskLambda);
        props.assignmentsTable.grantWriteData(this.assignTaskLambda);

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
        props.tasksTable.grantReadData(this.validateSubmissionLambda);
        props.submissionsTable.grantReadWriteData(this.validateSubmissionLambda);

        // Allow EventBridge put events
        this.validateSubmissionLambda.addToRolePolicy(new iam.PolicyStatement({
            actions: ['events:PutEvents'],
            resources: ['*'],
        }));

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
    }
}
