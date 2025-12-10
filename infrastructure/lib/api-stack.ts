import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as path from 'path';

import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';

interface ApiStackProps extends cdk.StackProps {
    userPool: cognito.UserPool;
    tasksTable: dynamodb.Table;
    submissionsTable: dynamodb.Table;
    submissionQueue: sqs.Queue;
    mediaBucket: s3.Bucket;
    workersTable: dynamodb.Table;
    requestersTable: dynamodb.Table;
    walletTable: dynamodb.Table;
    transactionsTable: dynamodb.Table;
    disputesTable: dynamodb.Table;
    // Optional: Python lambdas from PythonLambdaStack
    depositFundsLambda?: lambda.Function;
    withdrawFundsLambda?: lambda.Function;
    getWalletLambda?: lambda.Function;
    startDisputeLambda?: lambda.Function;
    adminReviewLambda?: lambda.Function;
}

export class ApiStack extends cdk.Stack {
    public readonly api: apigateway.RestApi;

    constructor(scope: Construct, id: string, props: ApiStackProps) {
        super(scope, id, props);

        this.api = new apigateway.RestApi(this, 'MicrotasksApi', {
            restApiName: 'Microtasks Service',
            description: 'This service serves the microtasks platform.',
            defaultCorsPreflightOptions: {
                allowOrigins: apigateway.Cors.ALL_ORIGINS,
                allowMethods: apigateway.Cors.ALL_METHODS,
            },
        });

        this.api.addGatewayResponse('GatewayResponseDefault4XX', {
            type: apigateway.ResponseType.DEFAULT_4XX,
            responseHeaders: {
                'Access-Control-Allow-Origin': "'*'",
                'Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
                'Access-Control-Allow-Methods': "'OPTIONS,GET,POST,PUT,DELETE'",
            },
        });

        this.api.addGatewayResponse('GatewayResponseDefault5XX', {
            type: apigateway.ResponseType.DEFAULT_5XX,
            responseHeaders: {
                'Access-Control-Allow-Origin': "'*'",
                'Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
                'Access-Control-Allow-Methods': "'OPTIONS,GET,POST,PUT,DELETE'",
            },
        });

        // Single Authorizer for the Platform
        const platformAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'PlatformAuthorizer', {
            cognitoUserPools: [props.userPool],
        });

        // --- Lambdas ---

        // Create Task
        const createTaskLambda = new nodejs.NodejsFunction(this, 'CreateTaskFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            entry: path.join(__dirname, '../../backend/src/tasks/create-task.ts'),
            handler: 'handler',
            environment: {
                TASKS_TABLE: props.tasksTable.tableName,
            },
        });
        props.tasksTable.grantWriteData(createTaskLambda);

        // List Tasks
        const listTasksLambda = new nodejs.NodejsFunction(this, 'ListTasksFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            entry: path.join(__dirname, '../../backend/src/tasks/list-tasks.ts'),
            handler: 'handler',
            environment: {
                TASKS_TABLE: props.tasksTable.tableName,
            },
        });
        props.tasksTable.grantReadData(listTasksLambda);



        // Get Leaderboard
        const getLeaderboardLambda = new nodejs.NodejsFunction(this, 'GetLeaderboardFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            entry: path.join(__dirname, '../../backend/src/workers/get-leaderboard.ts'),
            handler: 'handler',
            environment: {
                WORKERS_TABLE: props.workersTable.tableName,
            },
        });
        props.workersTable.grantReadData(getLeaderboardLambda);

        // Assign Role
        const assignRoleLambda = new nodejs.NodejsFunction(this, 'AssignRoleFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            entry: path.join(__dirname, '../../backend/src/auth/assign-role.ts'),
            handler: 'handler',
            environment: {
                WORKERS_TABLE: props.workersTable.tableName,
                REQUESTERS_TABLE: props.requestersTable.tableName,
            },
        });
        props.workersTable.grantReadWriteData(assignRoleLambda);
        props.requestersTable.grantReadWriteData(assignRoleLambda);


        // --- API Resources ---

        const auth = this.api.root.addResource('auth');
        const role = auth.addResource('role');
        // POST /auth/role
        role.addMethod('POST', new apigateway.LambdaIntegration(assignRoleLambda), {
            authorizer: platformAuthorizer,
        });

        const tasks = this.api.root.addResource('tasks');
        // POST /tasks (Any authenticated user can create tasks)
        tasks.addMethod('POST', new apigateway.LambdaIntegration(createTaskLambda), {
            authorizer: platformAuthorizer,
        });
        // GET /tasks (Any authenticated user can list tasks)
        tasks.addMethod('GET', new apigateway.LambdaIntegration(listTasksLambda), {
            authorizer: platformAuthorizer,
        });

        const submitWorkLambda = new nodejs.NodejsFunction(this, 'SubmitWorkFunction', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'handler',
            entry: path.join(__dirname, '../../backend/src/submissions/submit-work.ts'),
            environment: {
                SUBMISSIONS_TABLE: props.submissionsTable.tableName,
                TASKS_TABLE: props.tasksTable.tableName,
                REQUESTERS_TABLE: props.requestersTable.tableName,
                WORKERS_TABLE: props.workersTable.tableName,
                SUBMISSION_QUEUE_URL: props.submissionQueue.queueUrl,
            },
        });
        props.submissionsTable.grantWriteData(submitWorkLambda);
        props.tasksTable.grantReadWriteData(submitWorkLambda);
        props.requestersTable.grantReadData(submitWorkLambda);
        props.workersTable.grantReadData(submitWorkLambda);
        props.submissionQueue.grantSendMessages(submitWorkLambda);

        // Grant SES Permissions
        submitWorkLambda.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['ses:SendEmail', 'ses:SendRawEmail'],
            resources: ['*'], // In production, restrict to verified identities
        }));

        const submissions = this.api.root.addResource('submissions');
        // POST /submissions (Any authenticated user can submit work)
        submissions.addMethod('POST', new apigateway.LambdaIntegration(submitWorkLambda), {
            authorizer: platformAuthorizer,
        });

        // List Submissions by Task
        const listTaskSubmissionsLambda = new nodejs.NodejsFunction(this, 'ListTaskSubmissionsFunction', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'handler',
            entry: path.join(__dirname, '../../backend/src/submissions/list-by-task.ts'),
            environment: {
                SUBMISSIONS_TABLE: props.submissionsTable.tableName,
                TASKS_TABLE: props.tasksTable.tableName,
            },
        });
        props.submissionsTable.grantReadData(listTaskSubmissionsLambda);
        props.tasksTable.grantReadData(listTaskSubmissionsLambda);

        // Review Submission
        const reviewSubmissionLambda = new nodejs.NodejsFunction(this, 'ReviewSubmissionFunction', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'handler',
            entry: path.join(__dirname, '../../backend/src/submissions/review.ts'),
            environment: {
                SUBMISSIONS_TABLE: props.submissionsTable.tableName,
                TASKS_TABLE: props.tasksTable.tableName,
                WALLET_TABLE: props.walletTable.tableName,
                TRANSACTIONS_TABLE: props.transactionsTable.tableName,
                WORKERS_TABLE: props.workersTable.tableName,
            },
        });
        props.submissionsTable.grantReadWriteData(reviewSubmissionLambda);
        props.tasksTable.grantReadWriteData(reviewSubmissionLambda);
        props.walletTable.grantReadWriteData(reviewSubmissionLambda);
        props.transactionsTable.grantWriteData(reviewSubmissionLambda);
        props.workersTable.grantReadWriteData(reviewSubmissionLambda);

        // POST /submissions/{submissionId}/review
        const submissionById = submissions.addResource('{submissionId}');
        const reviewSubmission = submissionById.addResource('review');
        reviewSubmission.addMethod('POST', new apigateway.LambdaIntegration(reviewSubmissionLambda), {
            authorizer: platformAuthorizer,
        });

        // --- My Published Tasks (Requester) ---
        const listMyPublishedLambda = new nodejs.NodejsFunction(this, 'ListMyPublishedFunction', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'handler',
            entry: path.join(__dirname, '../../backend/src/tasks/list-my-published.ts'),
            environment: {
                TASKS_TABLE: props.tasksTable.tableName,
            },
        });
        props.tasksTable.grantReadData(listMyPublishedLambda);

        const myPublished = tasks.addResource('my-published');
        myPublished.addMethod('GET', new apigateway.LambdaIntegration(listMyPublishedLambda), {
            authorizer: platformAuthorizer,
        });

        // --- My Tasks (Worker) ---
        const listMyTasksLambda = new nodejs.NodejsFunction(this, 'ListMyTasksFunction', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'handler',
            entry: path.join(__dirname, '../../backend/src/tasks/list-my-tasks.ts'),
            environment: {
                TASKS_TABLE: props.tasksTable.tableName,
                SUBMISSIONS_TABLE: props.submissionsTable.tableName,
                MEDIA_BUCKET: props.mediaBucket.bucketName,
            },
        });
        props.tasksTable.grantReadData(listMyTasksLambda);
        props.submissionsTable.grantReadData(listMyTasksLambda);
        props.mediaBucket.grantRead(listMyTasksLambda);

        const myTasks = tasks.addResource('my-tasks');
        myTasks.addMethod('GET', new apigateway.LambdaIntegration(listMyTasksLambda), {
            authorizer: platformAuthorizer,
        });

        // --- Delete Task ---
        const deleteTaskLambda = new nodejs.NodejsFunction(this, 'DeleteTaskFunction', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'handler',
            entry: path.join(__dirname, '../../backend/src/tasks/delete-task.ts'),
            environment: {
                TASKS_TABLE: props.tasksTable.tableName,
            },
        });
        props.tasksTable.grantReadWriteData(deleteTaskLambda);

        const taskById = tasks.addResource('{taskId}');
        taskById.addMethod('DELETE', new apigateway.LambdaIntegration(deleteTaskLambda), {
            authorizer: platformAuthorizer,
        });

        // GET /tasks/{taskId}/submissions
        const taskSubmissions = taskById.addResource('submissions');
        taskSubmissions.addMethod('GET', new apigateway.LambdaIntegration(listTaskSubmissionsLambda), {
            authorizer: platformAuthorizer,
        });

        // --- Decline Task ---
        const declineTaskLambda = new nodejs.NodejsFunction(this, 'DeclineTaskFunction', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'handler',
            entry: path.join(__dirname, '../../backend/src/tasks/decline-task.ts'),
            environment: {
                TASKS_TABLE: props.tasksTable.tableName,
                WORKERS_TABLE: props.workersTable.tableName,
            },
        });
        props.tasksTable.grantReadWriteData(declineTaskLambda);
        props.workersTable.grantReadWriteData(declineTaskLambda);

        const declineTask = taskById.addResource('decline');
        declineTask.addMethod('POST', new apigateway.LambdaIntegration(declineTaskLambda), {
            authorizer: platformAuthorizer,
        });



        // --- Media Upload ---
        const uploadMediaLambda = new nodejs.NodejsFunction(this, 'UploadMediaFunction', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'handler',
            entry: path.join(__dirname, '../../backend/src/media/upload-media.ts'),
            environment: {
                MEDIA_BUCKET: props.mediaBucket.bucketName,
            },
        });
        props.mediaBucket.grantPut(uploadMediaLambda);

        const media = this.api.root.addResource('media');
        const upload = media.addResource('upload');
        // POST /media/upload (Generate pre-signed URL for upload)
        upload.addMethod('POST', new apigateway.LambdaIntegration(uploadMediaLambda), {
            authorizer: platformAuthorizer,
        });

        // Assign Task
        const assignTaskLambda = new nodejs.NodejsFunction(this, 'AssignTaskFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            entry: path.join(__dirname, '../../backend/src/tasks/assign-task.ts'),
            handler: 'handler',
            environment: {
                TASKS_TABLE: props.tasksTable.tableName,
            },
        });
        props.tasksTable.grantWriteData(assignTaskLambda);

        const assignTaskRoute = tasks.addResource('assign');
        assignTaskRoute.addMethod('POST', new apigateway.LambdaIntegration(assignTaskLambda), {
            authorizer: platformAuthorizer,
        });

        // --- Leaderboard ---
        const leaderboard = this.api.root.addResource('leaderboard');
        leaderboard.addMethod('GET', new apigateway.LambdaIntegration(getLeaderboardLambda), {
            authorizer: platformAuthorizer,
        });


        // ============ Wallet Endpoints (if lambdas provided) ============
        if (props.depositFundsLambda || props.withdrawFundsLambda || props.getWalletLambda) {
            const wallet = this.api.root.addResource('wallet');

            if (props.getWalletLambda) {
                // GET /wallet - Get user's wallet balance
                wallet.addMethod('GET', new apigateway.LambdaIntegration(props.getWalletLambda), {
                    authorizer: platformAuthorizer,
                });
            }

            if (props.depositFundsLambda) {
                const deposit = wallet.addResource('deposit');
                // POST /wallet/deposit - Deposit funds (mock)
                deposit.addMethod('POST', new apigateway.LambdaIntegration(props.depositFundsLambda), {
                    authorizer: platformAuthorizer,
                });
            }

            if (props.withdrawFundsLambda) {
                const withdraw = wallet.addResource('withdraw');
                // POST /wallet/withdraw - Withdraw funds (mock PayPal)
                withdraw.addMethod('POST', new apigateway.LambdaIntegration(props.withdrawFundsLambda), {
                    authorizer: platformAuthorizer,
                });
            }
        }

        // ============ Dispute Endpoints ============
        const disputes = this.api.root.addResource('disputes');

        // 1. Create Dispute
        const createDisputeLambda = new nodejs.NodejsFunction(this, 'CreateDisputeFunction', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'handler',
            entry: path.join(__dirname, '../../backend/src/disputes/create.ts'),
            environment: {
                DISPUTES_TABLE: props.disputesTable.tableName,
                SUBMISSIONS_TABLE: props.submissionsTable.tableName,
            },
        });
        props.disputesTable.grantWriteData(createDisputeLambda);
        props.submissionsTable.grantReadData(createDisputeLambda);

        disputes.addMethod('POST', new apigateway.LambdaIntegration(createDisputeLambda), {
            authorizer: platformAuthorizer
        });

        // 2. List Disputes
        const listDisputesLambda = new nodejs.NodejsFunction(this, 'ListDisputesFunction', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'handler',
            entry: path.join(__dirname, '../../backend/src/disputes/list.ts'),
            environment: {
                DISPUTES_TABLE: props.disputesTable.tableName,
            },
        });
        props.disputesTable.grantReadData(listDisputesLambda);

        disputes.addMethod('GET', new apigateway.LambdaIntegration(listDisputesLambda), {
            authorizer: platformAuthorizer // TODO: Validate admin group in lambda
        });

        // 3. Resolve Dispute
        const resolveDisputeLambda = new nodejs.NodejsFunction(this, 'ResolveDisputeFunction', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'handler',
            entry: path.join(__dirname, '../../backend/src/disputes/resolve.ts'),
            environment: {
                DISPUTES_TABLE: props.disputesTable.tableName,
                SUBMISSIONS_TABLE: props.submissionsTable.tableName,
                TASKS_TABLE: props.tasksTable.tableName,
                WALLET_TABLE: props.walletTable.tableName,
                TRANSACTIONS_TABLE: props.transactionsTable.tableName,
                WORKERS_TABLE: props.workersTable.tableName,
            },
        });
        props.disputesTable.grantReadWriteData(resolveDisputeLambda);
        props.submissionsTable.grantReadWriteData(resolveDisputeLambda);
        props.tasksTable.grantReadWriteData(resolveDisputeLambda);
        props.walletTable.grantReadWriteData(resolveDisputeLambda);
        props.transactionsTable.grantWriteData(resolveDisputeLambda);
        props.workersTable.grantReadWriteData(resolveDisputeLambda);

        const resolveDispute = disputes.addResource('resolve');
        resolveDispute.addMethod('POST', new apigateway.LambdaIntegration(resolveDisputeLambda), {
            authorizer: platformAuthorizer
        });

        // --- Outputs ---
        new cdk.CfnOutput(this, 'ApiUrl', {
            value: this.api.url,
            description: 'API Gateway URL',
        });
    }
}
