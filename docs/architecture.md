# PurrScription Architecture

## System Design

```
┌─────────────────────────────────────────────────────────────────┐
│                          Frontend (React)                       │
│  ├─ WaveSurfer.js (audio playback & waveform)                  │
│  ├─ Segments UI (create, edit, delete)                         │
│  ├─ Markers & Comments (quality issues, discussions)           │
│  ├─ Real-time Presence (who's online)                          │
│  ├─ Forms (login, project, task, gecko import)                 │
│  └─ WebSocket Client (real-time events)                        │
└────────┬──────────────────────────────────────────────────────┘
         │ HTTP(S) + WebSocket
         │
┌────────┴───────────────────────────────────────────────────────┐
│                  FastAPI Backend (Python)                       │
│  ├─ Authentication (JWT)                                       │
│  ├─ REST Routes (CRUD for all entities)                        │
│  ├─ WebSocket Server (broadcasts real-time events)             │
│  ├─ Services (business logic)                                  │
│  ├─ Middleware (CORS, logging, error handling)                 │
│  └─ Quality Firewall (export validation)                       │
└────────┬──────────────────────────────────────────────────────┘
         │
    ┌────┴────┬──────────┐
    │          │          │
    ▼          ▼          ▼
┌────────┐ ┌──────┐ ┌────────────┐
│PostgreSQL│ Redis  │ Whisper.cpp│
│(ORM)    │(cache) │  (ASR)     │
└────────┘ └──────┘ └────────────┘
```

## Data Flow

### 1. Import & Pre-annotation
1. User uploads audio or imports Gecko JSON
2. Backend creates MediaFile and initial Segments
3. ASR runs (async) to generate transcriptions with confidence scores
4. Segments broadcasted to WebSocket subscribers
5. Frontend receives and displays waveform + segments

### 2. Collaborative Editing
1. User focuses segment (soft lock, non-blocking)
2. User edits text → optimistic update (Zustand)
3. User clicks Save → PATCH /segments/{id} with version
4. Backend validates version, updates, increments version
5. Broadcasts segment_updated event to all clients
6. Other clients receive update and refresh local state
7. **Conflict**: If version mismatch → segment_conflict event, UI shows conflict dialog

### 3. Verification Workflow
```
NEW (initial)
  ↓
ASSIGNED (supervisor assigns to annotator)
  ↓
IN_PROGRESS (annotator edits)
  ↓
REVIEW (annotator submits)
  ↓
REWORK (verifier rejects) ⟷ FIXED (annotator re-edits)
  ↓
ACCEPTED (verifier accepts)
  ↓
EXPORTED (after quality gate)
```

### 4. Quality Firewall
Before export:
1. Check all Segments have text + speaker
2. Check no critical Markers unresolved
3. Check no critical Comments
4. Check Checklist completed
5. Check Task status = accepted
6. Check no version conflicts

If any fails → 422 QUALITY_GATE_FAILED response

### 5. Export
1. User clicks Export
2. Frontend calls POST /tasks/{id}/export
3. Backend runs Quality Firewall
4. If pass → generates ExportFile (JSON, VTT, SRT, TXT)
5. Creates AuditLog entry
6. Returns signed download URL
7. User downloads immutable artifact

## Real-time Concurrency

### Optimistic Concurrency Control

Each Segment has `version` field (integer, starts at 1):

**Update Request:**
```json
PATCH /segments/seg-123
{
  "text": "new text",
  "version": 5
}
```

**Backend Logic:**
```
current_version = db.segment.version  // 5
if request.version != current_version:
    return 409 CONFLICT + segment_conflict event
else:
    segment.version += 1
    segment.text = request.text
    broadcast segment_updated event
    return 200 success
```

**Client-side (Zustand store):**
```
On conflict:
  - Show dialog: "This segment was edited by X"
  - Offer: [Discard] [Reload] [Merge]
  - If reload: GET /segments/id → fetch latest
```

### Lock Types

| Lock | Type | Duration | Scope | Blocks |
|------|------|----------|-------|--------|
| Focus | Soft | 5 min | Presence indicator | None (informational) |
| Text | Soft/Hard | 2 min | Optimistic via version | No (version checked) |
| Boundaries | Hard | 2 min | Mutual exclusion | Yes (409 LOCK_CONFLICT) |

**Focus Lock (Soft):**
- User clicks on segment → emit segment_focused
- Shows "User X is viewing this"
- Auto-expires after 5 min or on disconnect
- Heartbeat every 30s to refresh TTL

**Text Lock (Soft):**
- User edits text field
- Optimistic concurrency via `version` field
- No exclusive lock; last-write-wins with conflict detection
- Conflict resolution: reload or merge

**Boundaries Lock (Hard):**
- User drags start/end markers on waveform
- Requires exclusive lock (409 if already locked)
- POST /segments/{id}/lock with lockType=boundaries
- Prevents race conditions on temporal boundaries
- Unlock automatically on submit or timeout

## WebSocket Protocol

### Connection Lifecycle

1. **Connect**: `ws://localhost:8000/ws`
2. **Subscribe**: `{ action: "subscribe", taskId: "task-123" }`
3. **Heartbeat**: Every 30s, client sends `{ action: "heartbeat", taskId: "task-123" }`
4. **Broadcast**: Server sends events to all subscribers
5. **Unsubscribe**: `{ action: "unsubscribe", taskId: "task-123" }`
6. **Disconnect**: Client closes connection

### Event Flow

**Client → Server:**
```json
{
  "action": "subscribe",
  "taskId": "task-123"
}
```

**Server → All Clients:**
```json
{
  "type": "user_joined",
  "timestamp": "2024-01-15T10:30:00Z",
  "taskId": "task-123",
  "userId": "user-456",
  "data": {
    "userId": "user-456",
    "userName": "Alice",
    "role": "annotator"
  }
}
```

### Reconnection

On reconnect:
1. WebSocket closes (network issue or browser tab inactive)
2. Frontend detects close event
3. Zustand store marks as "offline"
4. UI shows "Reconnecting..." banner
5. Exponential backoff retry: 1s, 2s, 4s, 8s, 16s, 32s (max 32s)
6. On reconnect: GET /tasks/{taskId}/snapshot → full state refresh
7. Zustand store replaces state with fresh data
8. Re-subscribe to WebSocket
9. UI shows "Back online" (briefly)

**Snapshot Response:**
```json
{
  "task": {...},
  "segments": [...],
  "markers": [...],
  "comments": [...],
  "presence": [...],
  "locks": [...]
}
```

## Authentication & Authorization

### JWT Flow

1. POST /auth/login → returns `{ access_token, refresh_token }`
2. All requests include `Authorization: Bearer <access_token>`
3. Backend validates JWT signature
4. Extract user_id, role from claims
5. Check role permissions (see AGENTS.md)
6. Token expires in 24 hours
7. Refresh token expires in 30 days

### Role-Based Access Control (RBAC)

| Endpoint | admin | supervisor | annotator | verifier | ml_engineer | customer |
|----------|-------|-----------|-----------|----------|-------------|----------|
| GET /projects | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (own) |
| POST /projects | ✓ | ✓ | | | | |
| GET /tasks | ✓ | ✓ | ✓ (assigned) | ✓ (to review) | ✓ | ✓ (own) |
| POST /tasks | ✓ | ✓ | | | | |
| PATCH /segments | ✓ | ✓ | ✓ (own) | ✓ | | |
| POST /verify | ✓ | ✓ | | ✓ | | |
| GET /export | ✓ | ✓ | | | | ✓ |

## Database Schema

See [data-model.md](data-model.md) for complete ERD.

## Error Handling

### REST Error Envelope

```json
{
  "error": {
    "code": "VERSION_MISMATCH",
    "message": "Segment version mismatch - optimistic concurrency conflict",
    "details": {
      "expected": 5,
      "received": 4
    },
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

### Common Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| VALIDATION_ERROR | 400 | Input validation failed |
| AUTHENTICATION_ERROR | 401 | JWT missing or invalid |
| AUTHORIZATION_ERROR | 403 | User lacks permission |
| RESOURCE_NOT_FOUND | 404 | Entity not found |
| CONFLICT | 409 | Resource already exists |
| VERSION_MISMATCH | 409 | Optimistic concurrency conflict |
| LOCK_CONFLICT | 409 | Hard lock acquisition failed |
| QUALITY_GATE_FAILED | 422 | Export blocked by quality checks |
| INTERNAL_SERVER_ERROR | 500 | Server error |
| SERVICE_UNAVAILABLE | 503 | Database/Redis down |

## Performance & Scalability

### Caching Strategy

- **Redis Cache**:
  - `user:{id}` → 24 hours (invalidate on role change)
  - `project:{id}` → 1 hour
  - `task:{id}` → 10 minutes
  - `segment:{id}` → 5 minutes

- **HTTP Cache**:
  - Static assets → 1 year (immutable)
  - API responses → no-cache (always fresh)

### Database Indexes

- `segments(task_id, status)` → query segments by task
- `segments(updated_at DESC)` → recent activity
- `markers(segment_id, status)` → query open markers
- `tasks(project_id, status)` → filter tasks by status
- `users(email UNIQUE)` → lookup by email

### Async Operations

- ASR transcription → background job (queue in Redis)
- Quality checks → async validator before export
- Export generation → async task (can take minutes)
- Audit logging → async write

## Deployment

See [docker-compose.yml](../docker-compose.yml) and [infra/](../infra/) for deployment config.

### Services

| Service | Image | Port | Health Check |
|---------|-------|------|--------------|
| web | nginx:alpine | 5173 | GET /health |
| api | python:3.12-slim | 8000 | GET /health |
| postgres | postgres:16-alpine | 5432 | pg_isready |
| redis | redis:7-alpine | 6379 | redis-cli ping |

## Development Workflow

1. **Start Docker**: `docker-compose up -d`
2. **Migrations**: Auto-run on API startup
3. **Seed Data**: `python scripts/seed.py`
4. **Frontend**: `npm run dev -w apps/web`
5. **Tests**: `npm run test:e2e` + `pytest tests/`

## Future Improvements

- [ ] Geospacial queries (segment timeline clustering)
- [ ] GraphQL API (alongside REST)
- [ ] Speaker diarization (Pyannote)
- [ ] Cross-talk detection
- [ ] Batch operations (multi-segment edit)
- [ ] Webhooks (for external integrations)
- [ ] SAML/OIDC auth (enterprise)
- [ ] Custom roles (RBAC beyond hardcoded)
