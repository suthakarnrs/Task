# Smart Reconciliation & Audit System

A full-stack MERN application for transaction reconciliation

## Architecture Overview

### Backend (Node.js + Express)

- **Async Processing**: File uploads processed asynchronously using job queues
- **Reconciliation Engine**: Configurable matching rules with exact, partial, and duplicate detection
- **Audit System**: Immutable audit logs for all data changes
- **Role-based Access**: Admin, Analyst, Viewer roles with proper authorization

### Frontend (React)

- **Dashboard**: Real-time reconciliation metrics with charts
- **File Upload**: CSV/Excel support with column mapping
- **Reconciliation View**: Side-by-side comparison with manual correction
- **Audit Timeline**: Visual timeline of all record changes

### Database (MongoDB)

- **Collections**: Users, UploadJobs, Records, ReconciliationResults, AuditLogs
- **Indexes**: Optimized for Transaction ID, Reference Number, Upload Job ID
- **Data Consistency**: Idempotent operations and duplicate prevention

## Key Features

- **Large File Handling**: Supports up to 50,000 records with streaming processing
- **Smart Reconciliation**: Configurable matching rules with tolerance settings
- **Complete Audit Trail**: Immutable logs of all system changes
- **Role-based Security**: Frontend and backend authorization enforcement
- **Responsive UI**: Non-blocking operations with real-time updates

## Trade-offs & Assumptions

1. **Performance vs Accuracy**: Prioritized accuracy over speed for reconciliation
2. **Memory Usage**: Streaming approach for large files vs in-memory processing
3. **Data Consistency**: Strong consistency over eventual consistency
4. **UI Complexity**: Rich features vs simple interface

## Limitations

- File size limited to 50,000 records for performance
- Reconciliation rules are configurable but require system restart
- Audit logs are immutable and cannot be deleted
- Real-time updates require WebSocket connection

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB 5.0+
- npm or yarn

### Installation

```bash
# Clone repository
git clone <repository-url>
cd smart-reconciliation-system

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### Environment Setup

```bash
# Backend .env
cp backend/.env.example backend/.env
# Configure MongoDB URI, JWT secret, etc.

# Start MongoDB
mongod

# Start backend
cd backend
npm run dev

# Start frontend
cd frontend
npm start
```

## API Documentation

See `/docs/api.md` for detailed API documentation or import the Postman collection from `/docs/postman-collection.json`.

## Sample Data

Sample CSV files are available in `/sample-data/` directory for testing.
