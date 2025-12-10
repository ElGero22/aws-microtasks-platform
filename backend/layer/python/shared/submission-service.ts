import { DynamoDBDocumentClient, TransactWriteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

interface ReviewParams {
    submissionId: string;
    decision: 'APPROVE' | 'REJECT' | 'PARTIAL';
    reason?: string;
    requesterId?: string; // Optional, strict check only if provided
    isAdmin?: boolean;    // If true, bypass requesterId check
}

interface TableNames {
    SUBMISSIONS_TABLE: string;
    TASKS_TABLE: string;
    WALLET_TABLE: string;
    TRANSACTIONS_TABLE: string;
    WORKERS_TABLE: string;
}

export class SubmissionService {
    constructor(
        private docClient: DynamoDBDocumentClient,
        private tables: TableNames
    ) { }

    async reviewSubmission(params: ReviewParams) {
        const { submissionId, decision, reason, requesterId, isAdmin } = params;

        // 1. Get Submission
        const subResult = await this.docClient.send(new GetCommand({
            TableName: this.tables.SUBMISSIONS_TABLE,
            Key: { submissionId }
        }));

        if (!subResult.Item) {
            throw new Error('Submission not found');
        }

        const submission = subResult.Item;
        const { taskId, workerId } = submission;

        // 2. Verify Task Ownership (if not admin)
        const taskResult = await this.docClient.send(new GetCommand({
            TableName: this.tables.TASKS_TABLE,
            Key: { taskId }
        }));

        if (!taskResult.Item) {
            throw new Error('Task not found');
        }
        const task = taskResult.Item;

        if (!isAdmin && requesterId && task.requesterId !== requesterId) {
            throw new Error('Unauthorized');
        }

        const fullReward = parseFloat(task.reward) || 0;
        let finalReward = fullReward;

        if (decision === 'PARTIAL') {
            finalReward = fullReward / 2;
        }

        const now = new Date().toISOString();

        // 3. Process Decision
        if (decision === 'APPROVE' || decision === 'PARTIAL') {
            const transactionId = uuidv4();
            const status = decision === 'APPROVE' ? 'APPROVED' : 'PARTIAL';
            const transactionItems: any[] = [
                // Update Submission
                {
                    Update: {
                        TableName: this.tables.SUBMISSIONS_TABLE,
                        Key: { submissionId },
                        UpdateExpression: 'set #status = :status, feedback = :feedback, reviewedAt = :reviewedAt',
                        ExpressionAttributeNames: { '#status': 'status' },
                        ExpressionAttributeValues: {
                            ':status': status,
                            ':feedback': reason || '',
                            ':reviewedAt': now
                        }
                    }
                }
            ];

            // Only update task status nicely if it's a full approval. 
            // If partial, maybe we still mark completed? Or leave as is if it was re-assigned?
            // User requirement: "Approve the task, pay half". 
            // Optimally, if we pay, we consider the worker's obligation met?
            // Constraint: Task might be re-assigned. 
            // Decision: If Partial, we DO NOT change Task status if it's currently Assigned/Completed by someone else. 
            // How do we know? We can check current task status.

            // For Simplicity/MVP: If Admin decides Partial, we just pay the worker and mark submission Partial.
            // We do NOT modify the Task Status to avoid conflicts with new assignees.

            if (decision === 'APPROVE') {
                transactionItems.push({
                    Update: {
                        TableName: this.tables.TASKS_TABLE,
                        Key: { taskId },
                        UpdateExpression: 'set #status = :status',
                        ExpressionAttributeNames: { '#status': 'status' },
                        ExpressionAttributeValues: { ':status': 'COMPLETED' }
                    }
                });
            }

            // Only credit wallet if not already approved/paid
            if (submission.status !== 'APPROVED' && submission.status !== 'PARTIAL') {
                transactionItems.push(
                    // Credit Worker Wallet
                    {
                        Update: {
                            TableName: this.tables.WALLET_TABLE,
                            Key: { walletId: workerId },
                            UpdateExpression: 'ADD balance :amount SET updatedAt = :updatedAt',
                            ExpressionAttributeValues: {
                                ':amount': finalReward,
                                ':updatedAt': now
                            }
                        }
                    },
                    // Record Transaction
                    {
                        Put: {
                            TableName: this.tables.TRANSACTIONS_TABLE,
                            Item: {
                                transactionId,
                                walletId: workerId,
                                type: 'EARNING',
                                amount: finalReward,
                                taskId,
                                submissionId,
                                description: `Payment for task: ${task.title} (${decision})` + (isAdmin ? ' (Resolved Dispute)' : ''),
                                createdAt: now
                            }
                        }
                    },
                    // Update Worker Stats
                    {
                        Update: {
                            TableName: this.tables.WORKERS_TABLE,
                            Key: { workerId },
                            UpdateExpression: 'ADD earnings :amount, tasksCompleted :one, approvedTasks :one',
                            ExpressionAttributeValues: {
                                ':amount': finalReward,
                                ':one': 1
                            }
                        }
                    }
                );
            }

            await this.docClient.send(new TransactWriteCommand({
                TransactItems: transactionItems
            }));

        } else if (decision === 'REJECT') {
            await this.docClient.send(new TransactWriteCommand({
                TransactItems: [
                    // Update Submission
                    {
                        Update: {
                            TableName: this.tables.SUBMISSIONS_TABLE,
                            Key: { submissionId },
                            UpdateExpression: 'set #status = :status, feedback = :feedback, reviewedAt = :reviewedAt',
                            ExpressionAttributeNames: { '#status': 'status' },
                            ExpressionAttributeValues: {
                                ':status': 'REJECTED',
                                ':feedback': reason || '',
                                ':reviewedAt': now
                            }
                        }
                    },
                    {
                        Update: {
                            TableName: this.tables.TASKS_TABLE,
                            Key: { taskId },
                            UpdateExpression: 'set #status = :status REMOVE assignedTo, assignedAt',
                            ExpressionAttributeNames: { '#status': 'status' },
                            ExpressionAttributeValues: {
                                ':status': 'AVAILABLE'
                            }
                        }
                    }
                ]
            }));
        }

        return { submissionId, status: decision };
    }
}
