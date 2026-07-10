# PurrScription Real-time Events (WebSocket)

## Connection

### URL
```
ws://localhost:8000/ws
wss://api.purrscription.dev/ws (production)
```

### Headers
```
Authorization: Bearer <access_token>
```

## Client → Server

### Subscribe
```json
{
  "action": "subscribe",
  "taskId": "task-123"
}
```

### Unsubscribe
```json
{
  "action": "unsubscribe",
  "taskId": "task-123"
}
```

### Heartbeat (sent every 30s)
```json
{
  "action": "heartbeat",
  "taskId": "task-123"
}
```

## Server → Clients (Broadcast Events)

All events have this envelope:

```json
{
  "type": "event_type",
  "timestamp": "2024-01-15T10:30:00Z",
  "taskId": "task-123",
  "userId": "user-123",
  "data": { /* event-specific data */ },
  "version": 1
}
```

---

## Events

### Presence Events

#### user_joined
Fired when a user connects to task WebSocket.

```json
{
  "type": "user_joined",
  "taskId": "task-123",
  "userId": "user-123",
  "data": {
    "userId": "user-123",
    "userName": "Alice Annotator",
    "role": "annotator"
  }
}
```

#### user_left
Fired when a user disconnects.

```json
{
  "type": "user_left",
  "taskId": "task-123",
  "userId": "user-123",
  "data": {
    "userId": "user-123"
  }
}
```

#### presence_updated
Updated list of all active users in task.

```json
{
  "type": "presence_updated",
  "taskId": "task-123",
  "userId": "server",
  "data": {
    "presence": [
      {
        "userId": "user-123",
        "taskId": "task-123",
        "lastSeenAt": "2024-01-15T10:30:00Z",
        "status": "active"
      },
      {
        "userId": "user-456",
        "taskId": "task-123",
        "lastSeenAt": "2024-01-15T10:29:55Z",
        "status": "active"
      }
    ]
  }
}
```

---

### Segment Events

#### segment_focused
User focused (clicked) on segment. Non-blocking, informational.

```json
{
  "type": "segment_focused",
  "taskId": "task-123",
  "userId": "user-123",
  "data": {
    "segmentId": "seg-123",
    "userId": "user-123",
    "lockType": "focus"
  }
}
```

#### segment_locked
User acquired hard lock on segment boundaries.

```json
{
  "type": "segment_locked",
  "taskId": "task-123",
  "userId": "user-123",
  "data": {
    "segmentId": "seg-123",
    "userId": "user-123",
    "lockType": "boundaries",
    "expiresAt": "2024-01-15T10:32:00Z"
  }
}
```

#### segment_unlocked
User released lock or lock expired.

```json
{
  "type": "segment_unlocked",
  "taskId": "task-123",
  "userId": "user-123",
  "data": {
    "segmentId": "seg-123",
    "lockType": "boundaries"
  }
}
```

#### segment_updated
Segment was successfully updated by another user.

```json
{
  "type": "segment_updated",
  "taskId": "task-123",
  "userId": "user-456",
  "version": 2,
  "data": {
    "segment": {
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
      "updatedBy": "user-456"
    },
    "changes": {
      "text": {
        "before": "Old text",
        "after": "Updated text"
      }
    },
    "updatedBy": "user-456"
  }
}
```

**Client Action**: Update local Zustand store with new segment. If local version < remote version, show toast "Segment updated by X".

#### segment_conflict
User's update was rejected due to version mismatch (optimistic concurrency conflict).

```json
{
  "type": "segment_conflict",
  "taskId": "task-123",
  "userId": "user-123",
  "data": {
    "segmentId": "seg-123",
    "versionMismatch": {
      "expected": 2,
      "received": 1
    },
    "currentSegment": {
      "id": "seg-123",
      "version": 2,
      "text": "Current server text",
      ...
    },
    "conflictedUpdate": {
      "text": "Your attempted edit"
    },
    "conflictedBy": "user-123"
  }
}
```

**Client Action**: Show conflict resolution dialog:
- "This segment was edited by X while you were editing it"
- Options: [Discard My Changes] [Reload from Server] [Merge]

#### segment_deleted
Another user deleted the segment.

```json
{
  "type": "segment_deleted",
  "taskId": "task-123",
  "userId": "user-456",
  "data": {
    "segmentId": "seg-123",
    "deletedBy": "user-456"
  }
}
```

**Client Action**: Remove segment from UI.

---

### Marker Events

#### marker_created
User created a quality marker on segment.

```json
{
  "type": "marker_created",
  "taskId": "task-123",
  "userId": "user-123",
  "data": {
    "marker": {
      "id": "marker-123",
      "segmentId": "seg-123",
      "type": "low-confidence",
      "severity": "warning",
      "status": "open",
      "description": "ASR confidence below 0.8",
      "createdBy": "user-123",
      "createdAt": "2024-01-15T10:30:00Z"
    },
    "createdBy": "user-123"
  }
}
```

**Client Action**: Append marker to segment UI.

#### marker_updated
Marker severity or description changed.

```json
{
  "type": "marker_updated",
  "taskId": "task-123",
  "userId": "user-123",
  "data": {
    "marker": { /* full marker object */ },
    "changes": {
      "severity": {
        "before": "warning",
        "after": "critical"
      }
    },
    "updatedBy": "user-123"
  }
}
```

#### marker_resolved
User resolved (closed) the marker.

```json
{
  "type": "marker_resolved",
  "taskId": "task-123",
  "userId": "user-456",
  "data": {
    "markerId": "marker-123",
    "status": "resolved",
    "resolution": "Manually verified, confidence is acceptable",
    "resolvedBy": "user-456"
  }
}
```

**Client Action**: Update marker status in UI, hide from "open issues" list.

---

### Comment Events

#### comment_created
User added comment to segment.

```json
{
  "type": "comment_created",
  "taskId": "task-123",
  "userId": "user-123",
  "data": {
    "comment": {
      "id": "comment-123",
      "segmentId": "seg-123",
      "text": "This needs review for accuracy",
      "author": "user-123",
      "createdAt": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z",
      "resolved": false
    },
    "createdBy": "user-123"
  }
}
```

#### comment_updated
Comment text was edited.

```json
{
  "type": "comment_updated",
  "taskId": "task-123",
  "userId": "user-123",
  "data": {
    "commentId": "comment-123",
    "text": "Updated comment text",
    "updatedBy": "user-123"
  }
}
```

#### comment_resolved
Comment marked as resolved.

```json
{
  "type": "comment_resolved",
  "taskId": "task-123",
  "userId": "user-456",
  "data": {
    "commentId": "comment-123",
    "resolvedBy": "user-456"
  }
}
```

---

### Quality & Task Events

#### quality_updated
Quality check was run (e.g., before export).

```json
{
  "type": "quality_updated",
  "taskId": "task-123",
  "userId": "user-123",
  "data": {
    "check": {
      "id": "qc-123",
      "taskId": "task-123",
      "checkType": "confidence-gate",
      "severity": "error",
      "message": "5 segments below 0.7 confidence",
      "passed": false,
      "runAt": "2024-01-15T10:40:00Z"
    },
    "taskId": "task-123"
  }
}
```

**Client Action**: Show quality report toast/notification.

#### task_status_changed
Task status changed (e.g., assigned → in_progress).

```json
{
  "type": "task_status_changed",
  "taskId": "task-123",
  "userId": "user-456",
  "data": {
    "taskId": "task-123",
    "status": "in_progress",
    "changedBy": "user-456",
    "reason": "Supervisor assigned and task started"
  }
}
```

**Client Action**: Update task status in sidebar/breadcrumb.

---

## Client Implementation

### JavaScript/React Example

```typescript
// Connection
const ws = new WebSocket(
  `${WS_URL}?token=${accessToken}`
);

// Subscribe
ws.send(JSON.stringify({
  action: 'subscribe',
  taskId: 'task-123'
}));

// Heartbeat
setInterval(() => {
  ws.send(JSON.stringify({
    action: 'heartbeat',
    taskId: 'task-123'
  }));
}, 30000);

// Listen
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  
  switch (msg.type) {
    case 'segment_updated':
      store.updateSegment(msg.data.segment);
      break;
    case 'segment_conflict':
      showConflictDialog(msg.data);
      break;
    case 'marker_created':
      store.addMarker(msg.data.marker);
      break;
    // ... handle other events
  }
});

// Reconnection with exponential backoff
let backoff = 1000;
const maxBackoff = 32000;

function reconnect() {
  ws = new WebSocket(`${WS_URL}?token=${accessToken}`);
  ws.addEventListener('open', () => {
    console.log('Reconnected');
    backoff = 1000;
  });
  ws.addEventListener('close', () => {
    setTimeout(reconnect, backoff);
    backoff = Math.min(backoff * 2, maxBackoff);
  });
}
```

### Zustand Store

```typescript
import { create } from 'zustand';

interface TaskStore {
  segments: Segment[];
  presence: PresenceUser[];
  isOnline: boolean;
  
  // WebSocket handlers
  handleSegmentUpdated: (segment: Segment) => void;
  handleUserJoined: (user: PresenceUser) => void;
  // ...
}

export const useTaskStore = create<TaskStore>((set) => ({
  segments: [],
  presence: [],
  isOnline: true,
  
  handleSegmentUpdated: (segment) => 
    set((state) => ({
      segments: state.segments.map((s) =>
        s.id === segment.id ? segment : s
      )
    })),
  
  handleUserJoined: (user) =>
    set((state) => ({
      presence: [...state.presence, user]
    }))
}));
```

---

## Connection Management

### Connection Lifecycle

```
CLIENT                          SERVER
  |
  |-- ws://... -->              [Accept]
  |                               |
  |<-- [Connected] --            
  |                               |
  |-- subscribe ----->            [Subscribe to task-123]
  |                               |
  |<-- presence_updated --       [List of active users]
  |
  | (User editing...)
  |
  |-- heartbeat (30s) -->        [Refresh TTL]
  |                               |
  | (Network error)
  |                               |
  |<-- [Disconnected] --
  |
  | (Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s)
  |
  |-- ws://... -->              [Reconnect]
  |<-- [Connected] --
  |
  |-- subscribe -->             [Get snapshot]
  |
  |<-- task snapshot --         [All segments, markers, etc.]
  |<-- presence_updated --
  |
  | (Back online)
```

### Reconnection Snapshot

When client reconnects, server sends full state snapshot:

```json
{
  "type": "snapshot",
  "taskId": "task-123",
  "data": {
    "task": { /* Task object */ },
    "segments": [ /* All segments for task */ ],
    "markers": [ /* All markers */ ],
    "comments": [ /* All comments */ ],
    "presence": [ /* Active users */ ],
    "locks": [ /* Active locks */ ]
  }
}
```

**Client Action**: Replace entire store state with snapshot, re-render UI.

---

## Error Handling

### Connection Error
```json
{
  "type": "error",
  "code": "AUTH_FAILED",
  "message": "Invalid or expired token"
}
```

**Client Action**: Redirect to login.

### Subscription Error
```json
{
  "type": "error",
  "code": "SUBSCRIBE_FAILED",
  "message": "Task not found or permission denied"
}
```

**Client Action**: Show error toast, redirect to tasks list.

---

## Performance Considerations

### Message Batching
For high-frequency updates (waveform playback, rapid edits):
- Client batches updates every 100ms
- Sends single message with array of changes
- Server processes batch atomically

### Backpressure
- Client: Max 1000 messages in send queue
- If queue fills, stop sending, wait for server catch-up
- Server: Drops slow clients after 30s no heartbeat

### Compression
- WebSocket text frames use gzip compression
- Reduces bandwidth by ~60% for event streams

---

## Testing

### Mock Server
```typescript
import { ws } from 'vitest-browser-mock-ws';

ws.addEventListener('connection', (connection) => {
  connection.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.action === 'subscribe') {
      connection.send(JSON.stringify({
        type: 'presence_updated',
        data: { presence: [] }
      }));
    }
  });
});
```

### E2E Testing (Playwright)
```typescript
test('real-time segment update', async ({ page }) => {
  // Open two browser contexts
  const page1 = await browser.newContext();
  const page2 = await browser.newContext();
  
  // Both join same task
  await page1.goto('http://localhost:5173/tasks/task-123');
  await page2.goto('http://localhost:5173/tasks/task-123');
  
  // Page1 edits segment
  await page1.click('.segment >> nth=0');
  await page1.fill('[name="text"]', 'Updated text');
  await page1.click('button:has-text("Save")');
  
  // Page2 should receive event and update UI
  await expect(page2.locator('.segment-text')).toContainText('Updated text');
});
```
