import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { DatabaseStack } from '../lib/database-stack';
import { WorkflowStack } from '../lib/workflow-stack';
import { AuthStack } from '../lib/auth-stack';

describe('Database Stack', () => {
    const app = new cdk.App();
    const stack = new DatabaseStack(app, 'TestDatabaseStack');
    const template = Template.fromStack(stack);

    test('Creates TasksTable with correct configuration', () => {
        template.hasResourceProperties('AWS::DynamoDB::Table', {
            KeySchema: Match.arrayWith([
                Match.objectLike({ AttributeName: 'taskId', KeyType: 'HASH' })
            ]),
            BillingMode: 'PAY_PER_REQUEST'
        });
    });

    test('Creates SubmissionsTable with GSI', () => {
        template.hasResourceProperties('AWS::DynamoDB::Table', {
            GlobalSecondaryIndexes: Match.arrayWith([
                Match.objectLike({
                    IndexName: 'byTask'
                })
            ])
        });
    });

    test('Creates WalletTable', () => {
        template.resourceCountIs('AWS::DynamoDB::Table', 7); // All 7 tables
    });

    test('Creates WorkersTable with GSI for levels', () => {
        template.hasResourceProperties('AWS::DynamoDB::Table', {
            GlobalSecondaryIndexes: Match.arrayWith([
                Match.objectLike({
                    IndexName: 'byLevel'
                })
            ])
        });
    });
});

describe('Workflow Stack', () => {
    const app = new cdk.App();
    const stack = new WorkflowStack(app, 'TestWorkflowStack');
    const template = Template.fromStack(stack);

    test('Creates SQS Queue for submissions', () => {
        template.hasResourceProperties('AWS::SQS::Queue', {
            VisibilityTimeout: 300
        });
    });

    test('Creates Dead Letter Queue', () => {
        template.resourceCountIs('AWS::SQS::Queue', 2);
    });

    test('Creates Step Functions State Machine', () => {
        template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
            StateMachineType: 'EXPRESS'
        });
    });

    test('Creates SNS Topic for admin notifications', () => {
        template.hasResourceProperties('AWS::SNS::Topic', {
            TopicName: 'dispute-admin-notifications'
        });
    });
});

describe('Auth Stack', () => {
    const app = new cdk.App();
    const stack = new AuthStack(app, 'TestAuthStack');
    const template = Template.fromStack(stack);

    test('Creates Cognito User Pool', () => {
        template.hasResourceProperties('AWS::Cognito::UserPool', {
            AutoVerifiedAttributes: ['email']
        });
    });

    test('Creates User Pool Client', () => {
        template.resourceCountIs('AWS::Cognito::UserPoolClient', 1);
    });
});
