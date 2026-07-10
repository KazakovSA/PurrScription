import {
  UserRole,
  TaskStatus,
  SegmentStatus,
  QualitySeverity,
  MarkerStatus,
  VerificationResult,
  Speaker,
} from './enums.js';

// === User ===
export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface UserCreateRequest {
  email: string;
  name: string;
  password: string;
  role: UserRole;
}

// === Project ===
export interface Project {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectCreateRequest {
  name: string;
  description?: string;
}

// === MediaFile ===
export interface MediaFile {
  id: string;
  projectId: string;
  name: string;
  mimeType: string;
  duration: number;
  samplingRate: number;
  channels: number;
  fileSize: number;
  uploadedBy: string;
  uploadedAt: string;
  url: string;
}

// === Task ===
export interface Task {
  id: string;
  projectId: string;
  name: string;
  status: TaskStatus;
  mediaFileId: string;
  assignedTo?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface TaskCreateRequest {
  projectId: string;
  name: string;
  mediaFileId: string;
  assignedTo?: string;
}

export interface TaskUpdateRequest {
  status?: TaskStatus;
  assignedTo?: string | null;
}

// === Segment (Core Entity) ===
export interface Segment {
  id: string;
  taskId: string;
  start: number; // seconds
  end: number; // seconds
  text: string;
  speaker: Speaker;
  confidence: number; // 0.0 - 1.0, from ASR
  status: SegmentStatus;
  version: number; // Optimistic concurrency
  updatedAt: string;
  updatedBy: string;
}

export interface SegmentCreateRequest {
  taskId: string;
  start: number;
  end: number;
  text?: string;
  speaker?: Speaker;
  confidence?: number;
}

export interface SegmentUpdateRequest {
  start?: number;
  end?: number;
  text?: string;
  speaker?: Speaker;
  version: number; // Required for optimistic concurrency
}

export interface SegmentLock {
  segmentId: string;
  userId: string;
  lockType: 'focus' | 'text' | 'boundaries';
  acquiredAt: string;
  expiresAt: string;
}

// === Segment Revision (Audit Trail) ===
export interface SegmentRevision {
  id: string;
  segmentId: string;
  version: number;
  text: string;
  speaker: Speaker;
  start: number;
  end: number;
  confidence: number;
  changedBy: string;
  changedAt: string;
}

// === Transcript Version ===
export interface TranscriptVersion {
  id: string;
  taskId: string;
  version: number;
  segments: Segment[];
  createdBy: string;
  createdAt: string;
}

// === Marker (Quality Marker) ===
export interface Marker {
  id: string;
  segmentId: string;
  type: string; // 'low-confidence', 'incomplete', 'crosstalk', 'music', 'overlapping', etc.
  severity: QualitySeverity;
  status: MarkerStatus;
  description?: string;
  createdBy: string;
  createdAt: string;
  resolvedBy?: string;
  resolvedAt?: string;
  resolution?: string;
}

export interface MarkerCreateRequest {
  segmentId: string;
  type: string;
  severity: QualitySeverity;
  description?: string;
}

export interface MarkerUpdateRequest {
  status?: MarkerStatus;
  resolution?: string;
}

// === Comment ===
export interface Comment {
  id: string;
  segmentId: string;
  text: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  resolved: boolean;
}

export interface CommentCreateRequest {
  segmentId: string;
  text: string;
}

// === Term (Glossary) ===
export interface Term {
  id: string;
  projectId: string;
  text: string;
  translation?: string;
  context?: string;
  createdBy: string;
  createdAt: string;
}

// === ChecklistItem ===
export interface ChecklistItem {
  id: string;
  taskId: string;
  description: string;
  required: boolean;
  completed: boolean;
  completedBy?: string;
  completedAt?: string;
}

export interface ChecklistItemUpdateRequest {
  completed: boolean;
}

// === QualityCheck (Automated Validation) ===
export interface QualityCheck {
  id: string;
  taskId: string;
  checkType: string; // 'confidence-gate', 'completeness', 'conflict-detection', 'format-validation'
  severity: QualitySeverity;
  message: string;
  passed: boolean;
  runAt: string;
}

// === VerificationResult ===
export interface VerificationResult {
  id: string;
  taskId: string;
  verifiedBy: string;
  result: VerificationResult;
  comment?: string;
  verifiedAt: string;
}

// === Presence (Real-time) ===
export interface PresenceUser {
  userId: string;
  taskId: string;
  lastSeenAt: string;
  status: 'active' | 'idle' | 'disconnected';
}

// === ASR Run (ML Metadata) ===
export interface ASRRun {
  id: string;
  taskId: string;
  model: string;
  version: string;
  device: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  error?: string;
}

// === ExportFile (Immutable Artifact) ===
export interface ExportFile {
  id: string;
  taskId: string;
  format: 'json' | 'vtt' | 'srt' | 'txt';
  url: string;
  fileSize: number;
  checksum: string;
  exportedBy: string;
  exportedAt: string;
  qualityGatePassed: boolean;
}

// === AuditLog ===
export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

// === Error Envelope (REST) ===
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    timestamp: string;
  };
}

// === Success Envelope (REST) ===
export interface SuccessResponse<T> {
  data: T;
  meta?: {
    version: string;
    timestamp: string;
  };
}

// === Pagination ===
export interface Pagination {
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
}
