# Smart Reconciliation System API Documentation

## Base URL

```
http://localhost:5000/api
```

## Authentication

All protected endpoints require a Bearer token in the Authorization header:

```
Authorization: Bearer <jwt_token>
```

## Endpoints

### Authentication

#### POST /auth/register

Register a new user.

**Request Body:**

```json
{
  "username": "string",
  "email": "string",
  "password": "string",
  "role": "admin|analyst|viewer"
}
```

**Response:**

```json
{
  "message": "User registered successfully",
  "token": "jwt_token",
  "user": {
    "_id": "user_id",
    "username": "string",
    "email": "string",
    "role": "string"
  }
}
```

#### POST /auth/login

Login user.

**Request Body:**

```json
{
  "email": "string",
  "password": "string"
}
```

**Response:**

```json
{
  "message": "Login successful",
  "token": "jwt_token",
  "user": {
    "_id": "user_id",
    "username": "string",
    "email": "string",
    "role": "string"
  }
}
```

#### GET /auth/me

Get current user information.

**Headers:** Authorization required

**Response:**

```json
{
  "user": {
    "_id": "user_id",
    "username": "string",
    "email": "string",
    "role": "string"
  }
}
```

### File Upload

#### POST /upload/file

Upload a CSV or Excel file.

**Headers:**

- Authorization required
- Content-Type: multipart/form-data

**Form Data:**

- `file`: File (CSV, XLSX, XLS)

**Response:**

```json
{
  "message": "File uploaded successfully",
  "jobId": "uuid",
  "filename": "string",
  "fileSize": "number",
  "status": "processing"
}
```

#### GET /upload/preview/:jobId

Get file preview with first 20 rows.

**Headers:** Authorization required

**Response:**

```json
{
  "headers": ["column1", "column2"],
  "preview": [{ "column1": "value1", "column2": "value2" }],
  "totalRows": "number",
  "filename": "string"
}
```

#### POST /upload/mapping/:jobId

Submit column mapping and start processing.

**Headers:** Authorization required

**Request Body:**

```json
{
  "transactionId": "column_name",
  "amount": "column_name",
  "referenceNumber": "column_name",
  "date": "column_name",
  "description": "column_name",
  "category": "column_name"
}
```

**Response:**

```json
{
  "message": "Column mapping saved and processing started",
  "jobId": "uuid",
  "columnMapping": {}
}
```

#### GET /upload/status/:jobId

Get upload job status.

**Headers:** Authorization required

**Response:**

```json
{
  "_id": "job_id",
  "jobId": "uuid",
  "filename": "string",
  "originalName": "string",
  "status": "processing|completed|failed",
  "totalRecords": "number",
  "processedRecords": "number",
  "errorRecords": "number",
  "errors": [],
  "uploadedBy": {
    "username": "string",
    "email": "string"
  }
}
```

#### GET /upload/jobs

Get user's upload jobs with pagination.

**Headers:** Authorization required

**Query Parameters:**

- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10)
- `status`: Filter by status

**Response:**

```json
{
  "jobs": [],
  "pagination": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "pages": "number"
  }
}
```

### Reconciliation

#### GET /reconciliation/results

Get reconciliation results with filters.

**Headers:** Authorization required

**Query Parameters:**

- `uploadJobId`: Filter by upload job
- `matchStatus`: Filter by match status
- `dateFrom`: Start date filter
- `dateTo`: End date filter
- `page`: Page number
- `limit`: Items per page

**Response:**

```json
{
  "results": [
    {
      "_id": "result_id",
      "uploadedRecordId": {},
      "systemRecordId": {},
      "matchStatus": "matched|partially_matched|not_matched|duplicate",
      "matchScore": "number",
      "differences": [],
      "isManuallyResolved": "boolean"
    }
  ],
  "pagination": {}
}
```

#### GET /reconciliation/results/:id

Get specific reconciliation result.

**Headers:** Authorization required

**Response:**

```json
{
  "_id": "result_id",
  "uploadedRecordId": {},
  "systemRecordId": {},
  "matchStatus": "string",
  "matchScore": "number",
  "differences": [],
  "uploadJobId": {},
  "isManuallyResolved": "boolean",
  "resolvedBy": {},
  "notes": "string"
}
```

#### PUT /reconciliation/results/:id/resolve

Manually resolve reconciliation result.

**Headers:** Authorization required
**Roles:** admin, analyst

**Request Body:**

```json
{
  "matchStatus": "matched|partially_matched|not_matched",
  "systemRecordId": "record_id",
  "notes": "string"
}
```

**Response:**

```json
{
  "message": "Reconciliation result resolved successfully",
  "result": {}
}
```

#### GET /reconciliation/stats/:uploadJobId

Get reconciliation statistics for upload job.

**Headers:** Authorization required

**Response:**

```json
{
  "matched": "number",
  "partially_matched": "number",
  "not_matched": "number",
  "duplicate": "number",
  "total": "number",
  "accuracy": "number"
}
```

### Dashboard

#### GET /dashboard/summary

Get dashboard summary with filters.

**Headers:** Authorization required

**Query Parameters:**

- `dateFrom`: Start date filter
- `dateTo`: End date filter
- `uploadedBy`: Filter by user
- `status`: Filter by status

**Response:**

```json
{
  "uploads": {
    "processing": "number",
    "completed": "number",
    "failed": "number",
    "totalUploads": "number",
    "totalRecords": "number",
    "processedRecords": "number",
    "errorRecords": "number"
  },
  "reconciliation": {
    "matched": "number",
    "partially_matched": "number",
    "not_matched": "number",
    "duplicate": "number",
    "total": "number",
    "accuracy": "number"
  }
}
```

#### GET /dashboard/trends

Get reconciliation and upload trends.

**Headers:** Authorization required

**Query Parameters:**

- `dateFrom`: Start date
- `dateTo`: End date
- `uploadedBy`: Filter by user

**Response:**

```json
{
  "reconciliationTrends": [
    {
      "date": "YYYY-MM-DD",
      "matched": "number",
      "partially_matched": "number",
      "not_matched": "number",
      "duplicate": "number",
      "total": "number",
      "accuracy": "number"
    }
  ],
  "uploadTrends": [
    {
      "_id": "YYYY-MM-DD",
      "uploads": "number",
      "totalRecords": "number",
      "processedRecords": "number"
    }
  ]
}
```

#### GET /dashboard/activity

Get recent activity.

**Headers:** Authorization required

**Query Parameters:**

- `limit`: Number of items (default: 10)

**Response:**

```json
{
  "recentUploads": [],
  "recentReconciliations": []
}
```

### Audit

#### GET /audit/logs

Get audit logs with filters.

**Headers:** Authorization required
**Roles:** admin, analyst

**Query Parameters:**

- `entityType`: Filter by entity type
- `entityId`: Filter by entity ID
- `action`: Filter by action
- `userId`: Filter by user
- `dateFrom`: Start date
- `dateTo`: End date
- `page`: Page number
- `limit`: Items per page

**Response:**

```json
{
  "logs": [
    {
      "_id": "log_id",
      "entityType": "string",
      "entityId": "string",
      "action": "string",
      "userId": {},
      "oldValue": {},
      "newValue": {},
      "changes": [],
      "source": "string",
      "createdAt": "date"
    }
  ],
  "pagination": {}
}
```

#### GET /audit/timeline/:entityType/:entityId

Get audit timeline for specific entity.

**Headers:** Authorization required

**Response:**

```json
{
  "entityType": "string",
  "entityId": "string",
  "timeline": [
    {
      "id": "log_id",
      "timestamp": "date",
      "action": "string",
      "user": {},
      "changes": [],
      "source": "string"
    }
  ]
}
```

## Error Responses

All endpoints may return these error responses:

### 400 Bad Request

```json
{
  "message": "Validation error message"
}
```

### 401 Unauthorized

```json
{
  "message": "Access denied. No token provided."
}
```

### 403 Forbidden

```json
{
  "message": "Access denied. Insufficient permissions.",
  "required": ["admin"],
  "current": "viewer"
}
```

### 404 Not Found

```json
{
  "message": "Resource not found"
}
```

### 500 Internal Server Error

```json
{
  "message": "Something went wrong!",
  "error": "Error details (development only)"
}
```

## Rate Limiting

API requests are limited to 100 requests per 15-minute window per IP address.

## File Upload Limits

- Maximum file size: 50MB
- Maximum records per file: 50,000
- Supported formats: CSV, XLSX, XLS
