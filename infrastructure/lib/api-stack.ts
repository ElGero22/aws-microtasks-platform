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

interface ApiStackProps extends cdk.StackProps {
    userPool: cognito.UserPool;
    tasksTable: dynamodb.Table;
    submissionsTable: dynamodb.Table;
    submissionQueue: sqs.Queue;
    mediaBucket: s3.Bucket;
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

        // Submit Work
        const submitWorkLambda = new nodejs.NodejsFunction(this, 'SubmitWorkFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            entry: path.join(__dirname, '../../backend/src/submissions/submit-work.ts'),
            handler: 'handler',
            environment: {
                SUBMISSIONS_TABLE: props.submissionsTable.tableName,
                SUBMISSION_QUEUE_URL: props.submissionQueue.queueUrl,
                TASKS_TABLE: props.tasksTable.tableName,
            },
        });
        props.submissionsTable.grantWriteData(submitWorkLambda);
        props.submissionQueue.grantSendMessages(submitWorkLambda);
        props.tasksTable.grantWriteData(submitWorkLambda);

        // --- API Resources ---

        const tasks = this.api.root.addResource('tasks');
        // POST /tasks (Any authenticated user can create tasks)
        tasks.addMethod('POST', new apigateway.LambdaIntegration(createTaskLambda), {
            authorizer: platformAuthorizer,
        });
        // GET /tasks (Any authenticated user can list tasks)
        tasks.addMethod('GET', new apigateway.LambdaIntegration(listTasksLambda), {
            authorizer: platformAuthorizer,
        });

        const submissions = this.api.root.addResource('submissions');
        // POST /submissions (Any authenticated user can submit work)
        submissions.addMethod('POST', new apigateway.LambdaIntegration(submitWorkLambda), {
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
            },
        });
        props.tasksTable.grantReadData(listMyTasksLambda);

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

        // --- Outputs ---
        new cdk.CfnOutput(this, 'ApiUrl', {
            value: this.api.url,
            description: 'API Gateway URL',
        });
    }
}
