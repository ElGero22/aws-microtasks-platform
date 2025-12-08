# AWS Microtasks Platform

A full-stack crowdsourcing platform built with AWS CDK, React, and TypeScript.

## 🎯 Features

### For Requesters
- **Create Tasks**: Post microtasks with multimedia support (images, audio, video)
- **Manage Tasks**: View and delete published tasks
- **Track Progress**: Monitor task status and submissions

### For Workers
- **Browse Tasks**: Explore available tasks with rich media previews
- **My Tasks**: Track assigned tasks and progress
- **Interactive Media**: Click to enlarge images, play audio/video

## 🏗️ Architecture

### Backend (AWS)
- **API Gateway**: RESTful API endpoints
- **Lambda Functions**: Serverless compute
- **DynamoDB**: NoSQL database with GSI indexes
- **S3**: Media storage with pre-signed URLs
- **Cognito**: User authentication
- **CloudFront**: CDN for frontend

### Frontend
- **React 18**: Modern UI framework
- **TypeScript**: Type-safe development
- **AWS Amplify**: Authentication integration
- **React Router**: Client-side routing

## 📁 Project Structure

```
aws-microtasks-platform/
├── backend/
│   └── src/
│       ├── handlers/           # Lambda handlers organized by domain
│       │   ├── disputes/       # Dispute management
│       │   ├── payments/       # Payment processing
│       │   ├── qc/             # Quality control & AI validation
│       │   ├── submissions/    # Submission handling
│       │   ├── tasks/          # Task CRUD operations
│       │   ├── wallet/         # Wallet & transactions
│       │   └── workers/        # Worker gamification
│       ├── shared/             # Shared Python modules
│       │   ├── config.py       # Environment configuration
│       │   ├── models.py       # Data models
│       │   ├── auth.py         # Authentication utilities
│       │   ├── dynamo.py       # DynamoDB helpers
│       │   ├── ai_services.py  # AWS AI integrations
│       │   └── utils.py        # Common utilities
│       ├── tasks/              # TypeScript task handlers
│       ├── media/              # Media upload handlers
│       └── qc/                 # QC processing
├── frontend/
│   └── src/
│       ├── components/         # Reusable React components
│       │   ├── BoundingBoxEditor.tsx
│       │   ├── DashboardMetrics.tsx
│       │   └── TaskMedia.tsx
│       ├── pages/              # React pages
│       │   ├── AdminDashboard.tsx
│       │   ├── RequesterDashboard.tsx
│       │   ├── WorkerDashboard.tsx
│       │   └── ...
│       └── styles/             # CSS styles
└── infrastructure/
    └── lib/                    # CDK stack definitions
        ├── auth-stack.ts       # Cognito authentication
        ├── database-stack.ts   # DynamoDB tables
        ├── api-stack.ts        # API Gateway + Lambdas
        ├── storage-stack.ts    # S3 buckets
        ├── workflow-stack.ts   # Step Functions & SQS
        ├── python-lambda-stack.ts  # Python Lambda functions
        └── frontend-stack.ts   # CloudFront + S3
```

## 🚀 Deployment

### Prerequisites
- AWS Account
- AWS CLI configured
- Node.js 18+
- AWS CDK CLI

### Steps

1. **Bootstrap CDK** (first time only):
```bash
cd infrastructure
npx cdk bootstrap
```

2. **Deploy Infrastructure**:
```bash
npx cdk deploy --all
```

3. **Build and Deploy Frontend**:
```bash
cd ../frontend
npm install
npm run build
aws s3 sync dist s3://YOUR-BUCKET-NAME --delete
aws cloudfront create-invalidation --distribution-id YOUR-DIST-ID --paths "/*"
```

## 🔧 Configuration

Update `frontend/src/aws-config.ts` with your deployed resources:
```typescript
export const authConfig = {
  Cognito: {
    userPoolId: 'YOUR_USER_POOL_ID',
    userPoolClientId: 'YOUR_CLIENT_ID',
  }
};

export const apiConfig = {
  endpoint: 'YOUR_API_GATEWAY_URL'
};
```

## 📊 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/tasks` | Create a new task |
| GET | `/tasks` | List all available tasks |
| GET | `/tasks/my-published` | List requester's tasks |
| GET | `/tasks/my-tasks` | List worker's assigned tasks |
| DELETE | `/tasks/{taskId}` | Delete a task |
| POST | `/submissions` | Submit work for a task |
| POST | `/media/upload` | Get pre-signed URL for upload |

## 🎨 Pages

1. **Landing** (`/`) - Choose role (Requester/Worker)
2. **Requester Dashboard** (`/requester`) - Create tasks
3. **Requester My Tasks** (`/requester/my-tasks`) - Manage published tasks
4. **Worker Dashboard** (`/worker`) - Browse available tasks
5. **Worker My Tasks** (`/worker/my-tasks`) - View assigned tasks

## 🔐 Security

- Cognito authentication for all API endpoints
- Pre-signed URLs for secure media uploads
- Owner validation for task deletion
- CORS configured for frontend domain

## 📝 License

MIT

## 👥 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
