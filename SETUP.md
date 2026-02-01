# Smart Reconciliation & Audit System - Setup Guide

## Prerequisites

- Node.js 18+
- MongoDB 5.0+
- Redis 6.0+
- npm or yarn

## Quick Start (Development)

### 1. Clone and Install Dependencies

```bash
# Install root dependencies
npm install

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Environment Setup

```bash
# Backend environment
cp backend/.env.example backend/.env
```

Edit `backend/.env` with your configuration:

```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/reconciliation_system
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRE=7d
REDIS_URL=redis://localhost:6379
MAX_FILE_SIZE=52428800
MAX_RECORDS=50000
RECONCILIATION_TOLERANCE=0.02
```

### 3. Start Services

#### Option A: Manual Setup

```bash
# Start MongoDB (if not using Docker)
mongod

# Start Redis (if not using Docker)
redis-server

# Seed database with sample data
cd backend
npm run seed

# Start backend server
npm run dev

# Start job workers (in new terminal)
npm run workers

# Start frontend (in new terminal)
cd ../frontend
npm run dev
```

#### Option B: Using Docker Compose

```bash
# Start all services
docker-compose up -d

# Seed database
docker-compose exec backend npm run seed
```

### 4. Access the Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:5000/api
- API Health Check: http://localhost:5000/api/health

## Default Users

After running the seed script, you can login with:

| Role    | Email               | Password   |
| ------- | ------------------- | ---------- |
| Admin   | admin@example.com   | admin123   |
| Analyst | analyst@example.com | analyst123 |
| Viewer  | viewer@example.com  | viewer123  |

## Testing the System

### 1. Upload Sample Data

1. Login as Admin or Analyst
2. Go to Upload page
3. Upload `sample-data/transactions.csv`
4. Map columns:
   - Transaction ID → Transaction ID
   - Amount → Amount
   - Reference Number → Reference Number
   - Date → Date
   - Description → Description
   - Category → Category
5. Start processing

### 2. View Results

1. Check Dashboard for summary metrics
2. Go to Reconciliation page to see match results
3. Click on audit timeline links to see change history

## Architecture Overview

### Backend Components

- **Express Server** (`server.js`): Main API server
- **Job Workers** (`workers/jobProcessor.js`): Async file processing
- **Models**: MongoDB schemas for data persistence
- **Services**: Business logic for file processing and reconciliation
- **Routes**: API endpoints with authentication and authorization

### Frontend Components

- **React SPA**: Single-page application with routing
- **Dashboard**: Real-time metrics and charts
- **Upload**: File upload with column mapping
- **Reconciliation**: Results viewing and manual resolution
- **Audit Timeline**: Visual change history

### Database Collections

- **users**: User accounts and roles
- **uploadjobs**: File upload tracking
- **records**: Transaction records (uploaded and system)
- **reconciliationresults**: Match results and scores
- **auditlogs**: Immutable change history

## Key Features Implemented

### ✅ File Upload & Processing

- Async processing with job queues
- Support for CSV and Excel files
- Column mapping interface
- Progress tracking and error handling
- Duplicate file detection

### ✅ Smart Reconciliation

- Configurable matching rules
- Exact match (Transaction ID + Amount)
- Partial match (Reference Number + Amount tolerance)
- Duplicate detection
- Match scoring algorithm

### ✅ Dashboard & Analytics

- Real-time summary cards
- Reconciliation accuracy charts
- Upload trends visualization
- Recent activity feed
- System health metrics

### ✅ Audit Trail

- Immutable audit logs
- Visual timeline interface
- Complete change tracking
- User attribution
- Source tracking (web UI, API, system)

### ✅ Role-Based Access

- Admin: Full system access
- Analyst: Upload and reconcile
- Viewer: Read-only access
- Frontend and backend enforcement

### ✅ Performance & Scalability

- Async job processing
- Database indexing
- Streaming file processing
- Pagination for large datasets
- Redis caching for job queues

## API Documentation

See `docs/api.md` for complete API documentation.

## Production Deployment

### Environment Variables

```env
NODE_ENV=production
MONGODB_URI=mongodb://username:password@host:port/database
REDIS_URL=redis://host:port
JWT_SECRET=secure_random_string
FRONTEND_URL=https://your-domain.com
```

### Security Considerations

- Use strong JWT secrets
- Enable MongoDB authentication
- Configure Redis password
- Use HTTPS in production
- Set up proper CORS origins
- Enable rate limiting
- Regular security updates

### Monitoring

- Monitor job queue health
- Track database performance
- Set up error alerting
- Monitor file upload volumes
- Track reconciliation accuracy

## Troubleshooting

### Common Issues

1. **MongoDB Connection Error**
   - Check MongoDB is running
   - Verify connection string
   - Check network connectivity

2. **Redis Connection Error**
   - Check Redis is running
   - Verify Redis URL
   - Check Redis memory usage

3. **File Upload Fails**
   - Check file size limits
   - Verify upload directory permissions
   - Check disk space

4. **Jobs Not Processing**
   - Check worker processes are running
   - Verify Redis connection
   - Check job queue status

### Logs

- Backend logs: Console output
- Job worker logs: Console output
- Frontend logs: Browser console
- MongoDB logs: MongoDB log files
- Redis logs: Redis log files

## Development

### Adding New Features

1. **Backend**: Add routes, models, services
2. **Frontend**: Add pages, components, API calls
3. **Database**: Update models and migrations
4. **Tests**: Add unit and integration tests

### Code Structure

```
backend/
├── models/          # MongoDB schemas
├── routes/          # API endpoints
├── services/        # Business logic
├── middleware/      # Auth, validation, etc.
├── workers/         # Background job processors
└── scripts/         # Utility scripts

frontend/
├── src/
│   ├── components/  # Reusable UI components
│   ├── pages/       # Route components
│   ├── services/    # API client
│   ├── contexts/    # React contexts
│   └── utils/       # Helper functions
```

## Support

For issues and questions:

1. Check this documentation
2. Review API documentation
3. Check application logs
4. Verify environment configuration
