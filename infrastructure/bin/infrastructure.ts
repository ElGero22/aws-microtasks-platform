#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AuthStack } from '../lib/auth-stack';
import { DatabaseStack } from '../lib/database-stack';
import { FrontendStack } from '../lib/frontend-stack';
import { WorkflowStack } from '../lib/workflow-stack';
import { ApiStack } from '../lib/api-stack';
import { StorageStack } from '../lib/storage-stack';

const app = new cdk.App();

const authStack = new AuthStack(app, 'AuthStack', {});

const databaseStack = new DatabaseStack(app, 'DatabaseStack', {});

const storageStack = new StorageStack(app, 'StorageStack', {});

const frontendStack = new FrontendStack(app, 'FrontendStack', {});

// Pass submissionsTable to WorkflowStack for QC Lambda
const workflowStack = new WorkflowStack(app, 'WorkflowStack', {
  submissionsTable: databaseStack.submissionsTable,
});

const apiStack = new ApiStack(app, 'ApiStack', {
  userPool: authStack.userPool,
  tasksTable: databaseStack.tasksTable,
  submissionsTable: databaseStack.submissionsTable,
  submissionQueue: workflowStack.submissionQueue,
  mediaBucket: storageStack.mediaBucket,
});
