export type Role =
  | "admin"
  | "supervisor"
  | "annotator"
  | "verifier"
  | "ml_engineer"
  | "customer";
export type TaskStatus =
  | "new"
  | "assigned"
  | "in_progress"
  | "review"
  | "rework"
  | "fixed"
  | "accepted"
  | "exported";
export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatarUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: User;
}
export interface Project {
  id: string;
  name: string;
  description: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
export interface Task {
  id: string;
  projectId: string;
  name: string;
  status: TaskStatus;
  mediaFileId: string;
  assignedTo: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}
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
export interface Segment {
  id: string;
  taskId: string;
  start: number;
  end: number;
  text: string;
  speaker: string | null;
  confidence: number;
  wordTimings?: Array<{
    text: string;
    type?: string;
    start?: number;
    end?: number;
    confidence?: number;
  }> | null;
  status: string;
  version: number;
  updatedAt: string;
  updatedBy: string;
}
export interface Marker {
  id: string;
  segmentId: string;
  type: string;
  severity: "info" | "warning" | "error" | "critical";
  status: string;
  description: string | null;
  createdBy: string;
  createdAt: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolution: string | null;
}
export interface CommentAuthor {
  id: string;
  name: string;
  role: Role;
  avatarUrl?: string | null;
}
export interface Comment {
  id: string;
  segmentId: string;
  text: string;
  author: CommentAuthor;
  createdAt: string;
  updatedAt: string;
  resolved: boolean;
  timeSeconds?: number | null;
  timeEndSeconds?: number | null;
  color?: string | null;
}
export interface QualityCheck {
  id: string;
  checkType: string;
  severity: string;
  message: string;
  passed: boolean;
}
export interface QualityReport {
  checks: QualityCheck[];
  taskStatus: string;
  canExport: boolean;
  blockers: string[];
  warnings: string[];
  score: number;
}
export interface Term {
  id: string;
  projectId: string;
  text: string;
  translation: string | null;
  context: string | null;
  status: "new" | "review" | "approved" | "rejected";
  createdBy: string;
  createdAt: string;
}
export interface ExportResult {
  id: string;
  taskId: string;
  format: string;
  url: string;
  fileSize: number;
}
export interface TaskAssignment {
  id: string;
  taskId: string;
  userId: string;
  userName: string;
  userRole: Role;
  assignedBy: string;
  assignedAt: string;
  startSeconds?: number | null;
  endSeconds?: number | null;
}
export interface Paginated<T> {
  data: T[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}
export interface Envelope<T> {
  data: T;
  meta?: { version: string; timestamp: string };
}
export interface ApiErrorPayload {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    timestamp?: string;
  };
}
export interface PresenceMember {
  userId: string;
  userName: string;
  role: string;
  color: string;
  focusedSegmentId?: string | null;
  avatarUrl?: string | null;
}
export interface SegmentLockState {
  segmentId: string;
  userId: string;
  lockType: "text" | "boundaries";
  expiresAt: string;
}
export interface SocketEvent {
  type: string;
  taskId: string;
  userId: string;
  data: Record<string, unknown>;
  version?: number;
}
