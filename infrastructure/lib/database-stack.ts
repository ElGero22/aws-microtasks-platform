import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

export class DatabaseStack extends cdk.Stack {
    public readonly tasksTable: dynamodb.Table;
    public readonly submissionsTable: dynamodb.Table;
    public readonly walletTable: dynamodb.Table;
    public readonly disputesTable: dynamodb.Table;
    public readonly transactionsTable: dynamodb.Table;
    public readonly assignmentsTable: dynamodb.Table;
    public readonly workersTable: dynamodb.Table;
    public readonly requestersTable: dynamodb.Table;

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // Tasks Table
        this.tasksTable = new dynamodb.Table(this, 'TasksTable', {
            partitionKey: { name: 'taskId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY, // For dev/test only
        });

        // GSI for querying tasks by requester
        this.tasksTable.addGlobalSecondaryIndex({
            indexName: 'RequesterIdIndex',
            partitionKey: { name: 'requesterId', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
        });

        // GSI for querying tasks by assigned worker
        this.tasksTable.addGlobalSecondaryIndex({
            indexName: 'AssignedToIndex',
            partitionKey: { name: 'assignedTo', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'assignedAt', type: dynamodb.AttributeType.STRING },
        });

        // GSI for querying tasks by status (Published, Assigned, etc.)
        this.tasksTable.addGlobalSecondaryIndex({
            indexName: 'StatusIndex',
            partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
        });

        // GSI for querying tasks by batch
        this.tasksTable.addGlobalSecondaryIndex({
            indexName: 'BatchIdIndex',
            partitionKey: { name: 'batchId', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
        });


        // Submissions Table
        this.submissionsTable = new dynamodb.Table(this, 'SubmissionsTable', {
            partitionKey: { name: 'submissionId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES, // For payment trigger
        });

        // GSI for querying submissions by Task
        this.submissionsTable.addGlobalSecondaryIndex({
            indexName: 'byTask',
            partitionKey: { name: 'taskId', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'workerId', type: dynamodb.AttributeType.STRING },
        });

        // GSI for querying submissions by Worker
        this.submissionsTable.addGlobalSecondaryIndex({
            indexName: 'byWorker',
            partitionKey: { name: 'workerId', type: dynamodb.AttributeType.STRING },
        });

        // Wallet Table
        this.walletTable = new dynamodb.Table(this, 'WalletTable', {
            partitionKey: { name: 'walletId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        // Disputes Table
        this.disputesTable = new dynamodb.Table(this, 'DisputesTable', {
            partitionKey: { name: 'disputeId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        // GSI for querying disputes by submission
        this.disputesTable.addGlobalSecondaryIndex({
            indexName: 'bySubmission',
            partitionKey: { name: 'submissionId', type: dynamodb.AttributeType.STRING },
        });

        // Transactions Table (payment records)
        this.transactionsTable = new dynamodb.Table(this, 'TransactionsTable', {
            partitionKey: { name: 'transactionId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        // Assignments Table (worker task assignments)
        this.assignmentsTable = new dynamodb.Table(this, 'AssignmentsTable', {
            partitionKey: { name: 'assignmentId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        // GSI for querying assignments by worker
        this.assignmentsTable.addGlobalSecondaryIndex({
            indexName: 'byWorker',
            partitionKey: { name: 'workerId', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
        });

        // GSI for querying assignments by task
        this.assignmentsTable.addGlobalSecondaryIndex({
            indexName: 'byTask',
            partitionKey: { name: 'taskId', type: dynamodb.AttributeType.STRING },
        });

        // Workers Table (worker profiles with gamification metrics)
        this.workersTable = new dynamodb.Table(this, 'WorkersTable', {
            partitionKey: { name: 'workerId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        // GSI for querying workers by level (for leaderboards, etc.)
        this.workersTable.addGlobalSecondaryIndex({
            indexName: 'byLevel',
            partitionKey: { name: 'level', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'accuracy', type: dynamodb.AttributeType.NUMBER },
        });

        // Requesters Table (requester profiles)
        this.requestersTable = new dynamodb.Table(this, 'RequestersTable', {
            partitionKey: { name: 'requesterId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
    }
}
