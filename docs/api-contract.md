# PurrScription API Contract v1.0

## Base URL

```
Development: http://localhost:8000
Production: https://api.purrscription.dev
```

## Authentication

All endpoints (except /auth/register and /health) require JWT bearer token:

```http
Authorization: Bearer <access_token>
```

## Response Format

### Success (2xx)

```json
{
  "data": { /* entity or array */ },
  "meta": {
    "version": "1.0.0",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

### Error (4xx, 5xx)

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": { /* optional context */ },
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 OK | Success |
| 201 Created | Resource created |
| 204 No Content | Success, no body |
| 400 Bad Request | Validation error |
| 401 Unauthorized | Missing/invalid JWT |
| 403 Forbidden | Insufficient permissions |
| 404 Not Found | Resource not found |
| 409 Conflict | Version mismatch, duplicate, lock conflict |
| 422 Unprocessable Entity | Business logic error (e.g., quality gate failed) |
| 500 Internal Server Error | Server error |
| 503 Service Unavailable | Database/Redis down |

---

## Endpoints

### Authentication

#### Register User
```http
POST /auth/register
Content-Type: application/json

{
  "email": "annotator@purrscription.dev",
  "name": "Alice Annotator",
  "password": "SecurePassword123!",
  "role": "annotator"
}
```

**Response: 201 Created**
```json
{
  "data": {
    "id": "user-123",
    "email": "annotator@purrscription.dev",
    "name": "Alice Annotator",
    "role": "annotator",
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:30:00Z"
  }
}
```

#### Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "annotator@purrscription.dev",
  "password": "SecurePassword123!"
}
```

**Response: 200 OK**
```json
{
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 86400,
    "user": {
      "id": "user-123",
      "email": "annotator@purrscription.dev",
      "name": "Alice Annotator",
      "role": "annotator"
    }
  }
}
```

#### Refresh Token
```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response: 200 OK** (same as login)

#### Get Current User
```http
GET /auth/me
Authorization: Bearer <access_token>
```

**Response: 200 OK**
```json
{
  "data": {
    "id": "user-123",
    "email": "annotator@purrscription.dev",
    "name": "Alice Annotator",
    "role": "annotator",
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:30:00Z"
  }
}
```

#### Logout
```http
POST /auth/logout
Authorization: Bearer <access_token>
```

**Response: 204 No Content**

---

### Projects

#### List Projects
```http
GET /projects?limit=20&offset=0
Authorization: Bearer <access_token>
```

**Response: 200 OK**
```json
{
  "data": [
    {
      "id": "proj-123",
      "name": "Q1 2024 Interviews",
      "description": "Customer interview transcriptions",
      "createdBy": "user-123",
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 42,
    "hasMore": true
  }
}
```

#### Create Project
```http
POST /projects
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "Q1 2024 Interviews",
  "description": "Customer interview transcriptions"
}
```

**Response: 201 Created**
```json
{
  "data": {
    "id": "proj-123",
    "name": "Q1 2024 Interviews",
    "description": "Customer interview transcriptions",
    "createdBy": "user-123",
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:30:00Z"
  }
}
```

#### Get Project
```http
GET /projects/proj-123
Authorization: Bearer <access_token>
```

**Response: 200 OK**

#### Update Project
```http
PATCH /projects/proj-123
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "Updated Name",
  "description": "Updated description"
}
```

**Response: 200 OK**

#### Delete Project
```http
DELETE /projects/proj-123
Authorization: Bearer <access_token>
```

**Response: 204 No Content**

---

### Media Files

#### Upload Audio
```http
POST /media/upload
Authorization: Bearer <access_token>
Content-Type: multipart/form-data

{
  "projectId": "proj-123",
  "file": <binary audio file>
}
```

**Response: 201 Created**
```json
{
  "data": {
    "id": "media-123",
    "projectId": "proj-123",
    "name": "interview-001.wav",
    "mimeType": "audio/wav",
    "duration": 3600.0,
    "samplingRate": 16000,
    "channels": 1,
    "fileSize": 115200000,
    "uploadedBy": "user-123",
    "uploadedAt": "2024-01-15T10:30:00Z",
    "url": "https://storage.purrscription.dev/media/media-123/file.wav"
  }
}
```

#### Import Gecko JSON
```http
POST /media/import-gecko
Authorization: Bearer <access_token>
Content-Type: multipart/form-data

{
  "projectId": "proj-123",
  "mediaFileId": "media-123",
  "geckoJson": <Gecko JSON file>,
  "audioFile": <optional replacement audio>
}
```

**Response: 201 Created** (creates MediaFile + initial Segments)
```json
{
  "data": {
    "mediaFile": { /* media object */ },
    "segmentsCreated": 12,
    "segments": [ /* array of 12 segments */ ]
  }
}
```

---

### Tasks

#### List Tasks
```http
GET /tasks?projectId=proj-123&status=assigned&limit=20&offset=0
Authorization: Bearer <access_token>
```

**Response: 200 OK**
```json
{
  "data": [
    {
      "id": "task-123",
      "projectId": "proj-123",
      "name": "Interview 001 - Transcription",
      "status": "assigned",
      "mediaFileId": "media-123",
      "assignedTo": "user-456",
      "createdBy": "user-123",
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T10:30:00Z",
      "completedAt": null
    }
  ],
  "pagination": { /* ... */ }
}
```

#### Create Task
```http
POST /tasks
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "projectId": "proj-123",
  "name": "Interview 001 - Transcription",
  "mediaFileId": "media-123",
  "assignedTo": "user-456"
}
```

**Response: 201 Created**

#### Get Task
```http
GET /tasks/task-123
Authorization: Bearer <access_token>
```

**Response: 200 OK**

#### Update Task Status
```http
PATCH /tasks/task-123
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "status": "in_progress",
  "assignedTo": "user-456"
}
```

**Response: 200 OK** (broadcasts task_status_changed event)

---

### Segments

#### List Segments
```http
GET /tasks/task-123/segments?status=annotated&limit=100
Authorization: Bearer <access_token>
```

**Response: 200 OK**
```json
{
  "data": [
    {
      "id": "seg-123",
      "taskId": "task-123",
      "start": 0.5,
      "end": 5.2,
      "text": "Hello, how are you?",
      "speaker": "TATLIN",
      "confidence": 0.95,
      "status": "annotated",
      "version": 1,
      "updatedAt": "2024-01-15T10:30:00Z",
      "updatedBy": "user-123"
    }
  ],
  "pagination": { /* ... */ }
}
```

#### Create Segment
```http
POST /segments
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "taskId": "task-123",
  "start": 0.5,
  "end": 5.2,
  "text": "Hello, how are you?",
  "speaker": "TATLIN",
  "confidence": 0.95
}
```

**Response: 201 Created** (broadcasts segment_updated event)

#### Update Segment (Optimistic Concurrency)
```http
PATCH /segments/seg-123
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "text": "Updated text",
  "version": 1
}
```

**Response: 200 OK** (version incremented to 2)
```json
{
  "data": {
    "id": "seg-123",
    "taskId": "task-123",
    "start": 0.5,
    "end": 5.2,
    "text": "Updated text",
    "speaker": "TATLIN",
    "confidence": 0.95,
    "status": "annotated",
    "version": 2,
    "updatedAt": "2024-01-15T10:35:00Z",
    "updatedBy": "user-123"
  }
}
```

**Conflict Response: 409 Conflict**
```json
{
  "error": {
    "code": "VERSION_MISMATCH",
    "message": "Segment version mismatch - optimistic concurrency conflict",
    "details": {
      "expected": 2,
      "received": 1
    }
  }
}
```

#### Acquire Boundaries Lock
```http
POST /segments/seg-123/lock
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "lockType": "boundaries",
  "ttl": 120000
}
```

**Response: 200 OK**
```json
{
  "data": {
    "segmentId": "seg-123",
    "userId": "user-123",
    "lockType": "boundaries",
    "acquiredAt": "2024-01-15T10:30:00Z",
    "expiresAt": "2024-01-15T10:32:00Z"
  }
}
```

**Conflict Response: 409 Conflict**
```json
{
  "error": {
    "code": "LOCK_CONFLICT",
    "message": "Segment is locked by another user",
    "details": {
      "lockedBy": "user-456",
      "expiresAt": "2024-01-15T10:32:00Z"
    }
  }
}
```

#### Release Lock
```http
POST /segments/seg-123/unlock
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "lockType": "boundaries"
}
```

**Response: 204 No Content** (broadcasts segment_unlocked event)

---

### Markers

#### Create Marker
```http
POST /markers
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "segmentId": "seg-123",
  "type": "low-confidence",
  "severity": "warning",
  "description": "ASR confidence below 0.8"
}
```

**Response: 201 Created** (broadcasts marker_created event)
```json
{
  "data": {
    "id": "marker-123",
    "segmentId": "seg-123",
    "type": "low-confidence",
    "severity": "warning",
    "status": "open",
    "description": "ASR confidence below 0.8",
    "createdBy": "user-123",
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

#### Resolve Marker
```http
POST /markers/marker-123/resolve
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "resolution": "Manually verified, confidence is acceptable"
}
```

**Response: 200 OK** (broadcasts marker_resolved event)

---

### Comments

#### Create Comment
```http
POST /comments
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "segmentId": "seg-123",
  "text": "This needs review for accuracy"
}
```

**Response: 201 Created** (broadcasts comment_created event)
```json
{
  "data": {
    "id": "comment-123",
    "segmentId": "seg-123",
    "text": "This needs review for accuracy",
    "author": "user-123",
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:30:00Z",
    "resolved": false
  }
}
```

#### Resolve Comment
```http
POST /comments/comment-123/resolve
Authorization: Bearer <access_token>
```

**Response: 204 No Content**

---

### Quality & Verification

#### Run Quality Checks
```http
POST /tasks/task-123/quality-check
Authorization: Bearer <access_token>
```

**Response: 200 OK**
```json
{
  "data": {
    "checks": [
      {
        "id": "qc-123",
        "checkType": "confidence-gate",
        "severity": "error",
        "message": "5 segments below 0.7 confidence",
        "passed": false
      },
      {
        "id": "qc-124",
        "checkType": "completeness",
        "severity": "warning",
        "message": "12 segments have no text",
        "passed": false
      }
    ],
    "taskStatus": "review",
    "canExport": false
  }
}
```

#### Get Verification Result
```http
GET /tasks/task-123/verification
Authorization: Bearer <access_token>
```

**Response: 200 OK**
```json
{
  "data": {
    "id": "vr-123",
    "taskId": "task-123",
    "verifiedBy": "user-456",
    "result": "accepted",
    "comment": "All segments verified and accepted",
    "verifiedAt": "2024-01-15T10:45:00Z"
  }
}
```

#### Submit Verification
```http
POST /tasks/task-123/verify
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "result": "accepted",
  "comment": "All segments verified and accepted"
}
```

**Response: 201 Created** (broadcasts task_status_changed)

---

### Export

#### Prepare Export
```http
POST /tasks/task-123/export/prepare
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "format": "vtt"
}
```

**Response: 200 OK**
```json
{
  "data": {
    "validationPassed": true,
    "blockers": [],
    "estimatedSize": 125000,
    "readyToExport": true
  }
}
```

**Quality Gate Failure: 422 Unprocessable Entity**
```json
{
  "error": {
    "code": "QUALITY_GATE_FAILED",
    "message": "Export blocked by quality gate: 5 critical markers unresolved",
    "details": {
      "blockers": [
        "5 segments have critical markers",
        "3 segments have no text",
        "Task not accepted by verifier"
      ]
    }
  }
}
```

#### Execute Export
```http
POST /tasks/task-123/export
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "format": "vtt"
}
```

**Response: 201 Created**
```json
{
  "data": {
    "id": "export-123",
    "taskId": "task-123",
    "format": "vtt",
    "url": "https://storage.purrscription.dev/exports/export-123/file.vtt",
    "fileSize": 125000,
    "checksum": "abc123def456...",
    "exportedBy": "user-123",
    "exportedAt": "2024-01-15T10:50:00Z",
    "qualityGatePassed": true
  }
}
```

---

### Health & Status

#### Health Check
```http
GET /health
```

**Response: 200 OK**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "services": {
    "database": "healthy",
    "redis": "healthy",
    "whisper": "ready"
  }
}
```

---

## WebSocket API

See [realtime.md](realtime.md)

---

## Error Handling

### Common Errors

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Input validation failed",
    "details": {
      "fields": {
        "email": "Invalid email format",
        "password": "Must be at least 8 characters"
      }
    }
  }
}
```

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Segment seg-999 not found"
  }
}
```

### Retry Strategy

| Status | Action |
|--------|--------|
| 2xx | Success, no retry |
| 429 Too Many Requests | Retry with exponential backoff |
| 5xx, 503 | Retry with exponential backoff |
| 401, 403 | Refresh token, retry once |
| 4xx (except 429) | Fail, don't retry |

---

## Rate Limiting

- **Default**: 100 requests per minute per user
- **Export**: 10 exports per hour per user
- **Upload**: 5 uploads per hour per user

**Rate Limit Headers**:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705315800
```

---

## Pagination

Default: `limit=20`, max: `limit=100`

```http
GET /tasks?limit=50&offset=100
```

Response includes:
```json
{
  "pagination": {
    "limit": 50,
    "offset": 100,
    "total": 1234,
    "hasMore": true
  }
}
```
