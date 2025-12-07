import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

export class DatabaseStack extends cdk.Stack {
    public readonly tasksTable: dynamodb.Table;
    public readonly submissionsTable: dynamodb.Table;
    public readonly walletTable: dynamodb.Table;

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


        // Submissions Table
        this.submissionsTable = new dynamodb.Table(this, 'SubmissionsTable', {
            partitionKey: { name: 'submissionId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
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
            partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
    }
}
