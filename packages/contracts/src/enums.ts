// User roles - fixed enum
export const USER_ROLES = {
  ADMIN: 'admin',
  SUPERVISOR: 'supervisor',
  ANNOTATOR: 'annotator',
  VERIFIER: 'verifier',
  ML_ENGINEER: 'ml_engineer',
  CUSTOMER: 'customer',
} as const;

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];

// Task statuses - fixed enum
export const TASK_STATUSES = {
  NEW: 'new',
  ASSIGNED: 'assigned',
  IN_PROGRESS: 'in_progress',
  REVIEW: 'review',
  REWORK: 'rework',
  FIXED: 'fixed',
  ACCEPTED: 'accepted',
  EXPORTED: 'exported',
} as const;

export type TaskStatus = typeof TASK_STATUSES[keyof typeof TASK_STATUSES];

// Segment statuses
export const SEGMENT_STATUSES = {
  PENDING: 'pending',
  ANNOTATED: 'annotated',
  VERIFIED: 'verified',
  CONFLICTED: 'conflicted',
} as const;

export type SegmentStatus = typeof SEGMENT_STATUSES[keyof typeof SEGMENT_STATUSES];

// Quality check severity
export const QUALITY_SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical',
} as const;

export type QualitySeverity = typeof QUALITY_SEVERITY[keyof typeof QUALITY_SEVERITY];

// Marker status
export const MARKER_STATUSES = {
  OPEN: 'open',
  RESOLVED: 'resolved',
  REJECTED: 'rejected',
} as const;

export type MarkerStatus = typeof MARKER_STATUSES[keyof typeof MARKER_STATUSES];

// Verification result
export const VERIFICATION_RESULTS = {
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  REWORK: 'rework',
} as const;

export type VerificationOutcome = typeof VERIFICATION_RESULTS[keyof typeof VERIFICATION_RESULTS];

// Speaker types
export const SPEAKER_TYPES = {
  TATLIN: 'TATLIN',
  VEGMAN: 'VEGMAN',
} as const;

export type SpeakerType = typeof SPEAKER_TYPES[keyof typeof SPEAKER_TYPES];

export const SPECIAL_SPEAKERS = ['[CROSSTALK]', '[OVERLAP]', '[MUSIC]', '[SILENCE]'] as const;

export type SpecialSpeaker = typeof SPECIAL_SPEAKERS[number];

export type Speaker = SpeakerType | SpecialSpeaker;
