import { Segment, Marker, Comment, QualityCheck, PresenceUser, SegmentLock } from './types.js';
import { TaskStatus } from './enums.js';

// === WebSocket Event Envelope ===
export interface WSEvent<T = unknown> {
  type: string;
  timestamp: string;
  taskId: string;
  userId: string;
  data: T;
  version?: number; // For concurrency tracking
}

// === Presence Events ===
export interface UserJoinedEvent {
  userId: string;
  userName: string;
  role: string;
}

export interface UserLeftEvent {
  userId: string;
}

export interface PresenceUpdatedEvent {
  presence: PresenceUser[];
}

// === Segment Events ===
export interface SegmentFocusedEvent {
  segmentId: string;
  userId: string;
  lockType: 'focus' | 'text' | 'boundaries';
}

export interface SegmentLockedEvent {
  segmentId: string;
  userId: string;
  lockType: 'text' | 'boundaries';
  expiresAt: string;
}

export interface SegmentUnlockedEvent {
  segmentId: string;
  lockType: 'text' | 'boundaries';
}

export interface SegmentUpdatedEvent {
  segment: Segment;
  changes: {
    start?: { before: number; after: number };
    end?: { before: number; after: number };
    text?: { before: string; after: string };
    speaker?: { before: string; after: string };
  };
  updatedBy: string;
}

export interface SegmentConflictEvent {
  segmentId: string;
  versionMismatch: {
    expected: number;
    received: number;
  };
  currentSegment: Segment;
  conflictedUpdate: Partial<Segment>;
  conflictedBy: string;
}

export interface SegmentDeletedEvent {
  segmentId: string;
  deletedBy: string;
}

// === Marker Events ===
export interface MarkerCreatedEvent {
  marker: Marker;
  createdBy: string;
}

export interface MarkerUpdatedEvent {
  marker: Marker;
  changes: {
    status?: { before: string; after: string };
    severity?: { before: string; after: string };
  };
  updatedBy: string;
}

export interface MarkerResolvedEvent {
  markerId: string;
  status: string;
  resolution: string;
  resolvedBy: string;
}

// === Comment Events ===
export interface CommentCreatedEvent {
  comment: Comment;
  createdBy: string;
}

export interface CommentUpdatedEvent {
  commentId: string;
  text: string;
  updatedBy: string;
}

export interface CommentResolvedEvent {
  commentId: string;
  resolvedBy: string;
}

// === Quality Events ===
export interface QualityUpdatedEvent {
  check: QualityCheck;
  taskId: string;
}

// === Task Status Events ===
export interface TaskStatusChangedEvent {
  taskId: string;
  status: TaskStatus;
  changedBy: string;
  reason?: string;
}

// === Broadcast Event Map ===
export type WSEventMap = {
  // Presence
  user_joined: WSEvent<UserJoinedEvent>;
  user_left: WSEvent<UserLeftEvent>;
  presence_updated: WSEvent<PresenceUpdatedEvent>;

  // Segment
  segment_focused: WSEvent<SegmentFocusedEvent>;
  segment_locked: WSEvent<SegmentLockedEvent>;
  segment_unlocked: WSEvent<SegmentUnlockedEvent>;
  segment_updated: WSEvent<SegmentUpdatedEvent>;
  segment_conflict: WSEvent<SegmentConflictEvent>;
  segment_deleted: WSEvent<SegmentDeletedEvent>;

  // Marker
  marker_created: WSEvent<MarkerCreatedEvent>;
  marker_updated: WSEvent<MarkerUpdatedEvent>;
  marker_resolved: WSEvent<MarkerResolvedEvent>;

  // Comment
  comment_created: WSEvent<CommentCreatedEvent>;
  comment_updated: WSEvent<CommentUpdatedEvent>;
  comment_resolved: WSEvent<CommentResolvedEvent>;

  // Quality
  quality_updated: WSEvent<QualityUpdatedEvent>;

  // Task
  task_status_changed: WSEvent<TaskStatusChangedEvent>;
};

// === Client Events (Incoming from Client) ===
export interface ClientMessage {
  action: string;
  taskId: string;
  data?: unknown;
}

export interface SubscribeMessage {
  action: 'subscribe';
  taskId: string;
}

export interface UnsubscribeMessage {
  action: 'unsubscribe';
  taskId: string;
}

export interface HeartbeatMessage {
  action: 'heartbeat';
  taskId: string;
}

// === Concurrency Rules (WebSocket) ===
export const CONCURRENCY_RULES = {
  FOCUS_TTL: 300000, // 5 min in ms
  FOCUS_HEARTBEAT: 30000, // 30 sec
  TEXT_LOCK_TTL: 120000, // 2 min
  BOUNDARIES_LOCK_TTL: 120000, // 2 min
  VERSION_MISMATCH_BLOCKS_UPDATE: true, // optimistic concurrency
  CONFLICT_NO_SILENT_OVERWRITE: true, // emit event
  RECONNECT_SENDS_SNAPSHOT: true, // full state on reconnect
} as const;

// === Helper Functions ===
export function createWSEvent<T>(
  type: keyof WSEventMap,
  taskId: string,
  userId: string,
  data: T,
  version?: number
): WSEvent<T> {
  return {
    type,
    timestamp: new Date().toISOString(),
    taskId,
    userId,
    data,
    version,
  };
}

export function isConflictEvent(event: WSEvent): event is WSEvent<SegmentConflictEvent> {
  return event.type === 'segment_conflict';
}

export function isLockEvent(
  event: WSEvent
): event is WSEvent<SegmentLockedEvent | SegmentUnlockedEvent> {
  return event.type === 'segment_locked' || event.type === 'segment_unlocked';
}
