import { SuccessResponse, ErrorResponse, PaginatedResponse } from './types.js';

// === REST Error Codes ===
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  CONFLICT: 'CONFLICT',
  VERSION_MISMATCH: 'VERSION_MISMATCH',
  LOCK_CONFLICT: 'LOCK_CONFLICT',
  QUALITY_GATE_FAILED: 'QUALITY_GATE_FAILED',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

// === HTTP Status Codes ===
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

// === Success Response Creators ===
export function createSuccessResponse<T>(data: T): SuccessResponse<T> {
  return {
    data,
    meta: {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    },
  };
}

export function createPaginatedResponse<T>(
  data: T[],
  limit: number,
  offset: number,
  total: number
): PaginatedResponse<T> {
  return {
    data,
    pagination: {
      limit,
      offset,
      total,
      hasMore: offset + limit < total,
    },
  };
}

// === Error Response Creator ===
export function createErrorResponse(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
  status: number = 500
): { body: ErrorResponse; status: number } {
  return {
    body: {
      error: {
        code,
        message,
        details,
        timestamp: new Date().toISOString(),
      },
    },
    status,
  };
}

// === Common Error Responses ===
export const COMMON_ERRORS = {
  VALIDATION_FAILED: (message: string, details?: unknown) =>
    createErrorResponse(
      'VALIDATION_ERROR',
      message || 'Validation failed',
      details as Record<string, unknown>,
      400
    ),

  UNAUTHORIZED: (message: string = 'Authentication required') =>
    createErrorResponse('AUTHENTICATION_ERROR', message, undefined, 401),

  FORBIDDEN: (message: string = 'Access denied') =>
    createErrorResponse('AUTHORIZATION_ERROR', message, undefined, 403),

  NOT_FOUND: (resource: string) =>
    createErrorResponse('RESOURCE_NOT_FOUND', `${resource} not found`, undefined, 404),

  CONFLICT: (message: string, details?: unknown) =>
    createErrorResponse('CONFLICT', message, details as Record<string, unknown>, 409),

  VERSION_MISMATCH: (expected: number, received: number) =>
    createErrorResponse(
      'VERSION_MISMATCH',
      'Version mismatch - optimistic concurrency conflict',
      { expected, received },
      409
    ),

  LOCK_CONFLICT: (message: string, details?: unknown) =>
    createErrorResponse('LOCK_CONFLICT', message, details as Record<string, unknown>, 409),

  QUALITY_GATE_FAILED: (reason: string, blockers?: unknown) =>
    createErrorResponse(
      'QUALITY_GATE_FAILED',
      `Export blocked by quality gate: ${reason}`,
      { blockers },
      422
    ),

  INTERNAL_ERROR: (message: string = 'Internal server error') =>
    createErrorResponse('INTERNAL_SERVER_ERROR', message, undefined, 500),

  SERVICE_UNAVAILABLE: (message: string = 'Service temporarily unavailable') =>
    createErrorResponse('SERVICE_UNAVAILABLE', message, undefined, 503),
};

// === REST API Routes (Documentation) ===
export const API_ROUTES = {
  // Auth
  AUTH_REGISTER: 'POST /auth/register',
  AUTH_LOGIN: 'POST /auth/login',
  AUTH_LOGOUT: 'POST /auth/logout',
  AUTH_REFRESH: 'POST /auth/refresh',
  AUTH_ME: 'GET /auth/me',

  // Projects
  PROJECTS_LIST: 'GET /projects',
  PROJECTS_CREATE: 'POST /projects',
  PROJECTS_GET: 'GET /projects/:id',
  PROJECTS_UPDATE: 'PATCH /projects/:id',
  PROJECTS_DELETE: 'DELETE /projects/:id',

  // Tasks
  TASKS_LIST: 'GET /tasks',
  TASKS_CREATE: 'POST /tasks',
  TASKS_GET: 'GET /tasks/:id',
  TASKS_UPDATE: 'PATCH /tasks/:id',
  TASKS_DELETE: 'DELETE /tasks/:id',

  // Media
  MEDIA_UPLOAD: 'POST /media/upload',
  MEDIA_IMPORT_GECKO: 'POST /media/import-gecko',
  MEDIA_GET: 'GET /media/:id',
  MEDIA_DELETE: 'DELETE /media/:id',

  // Segments
  SEGMENTS_LIST: 'GET /tasks/:taskId/segments',
  SEGMENTS_CREATE: 'POST /segments',
  SEGMENTS_GET: 'GET /segments/:id',
  SEGMENTS_UPDATE: 'PATCH /segments/:id',
  SEGMENTS_DELETE: 'DELETE /segments/:id',
  SEGMENTS_LOCK: 'POST /segments/:id/lock',
  SEGMENTS_UNLOCK: 'POST /segments/:id/unlock',

  // Markers
  MARKERS_LIST: 'GET /segments/:segmentId/markers',
  MARKERS_CREATE: 'POST /markers',
  MARKERS_UPDATE: 'PATCH /markers/:id',
  MARKERS_DELETE: 'DELETE /markers/:id',
  MARKERS_RESOLVE: 'POST /markers/:id/resolve',

  // Comments
  COMMENTS_LIST: 'GET /segments/:segmentId/comments',
  COMMENTS_CREATE: 'POST /comments',
  COMMENTS_UPDATE: 'PATCH /comments/:id',
  COMMENTS_DELETE: 'DELETE /comments/:id',
  COMMENTS_RESOLVE: 'POST /comments/:id/resolve',

  // Quality
  QUALITY_CHECKS: 'GET /tasks/:taskId/quality-checks',
  QUALITY_RUN: 'POST /tasks/:taskId/quality-check',

  // Verification
  VERIFICATION_CREATE: 'POST /tasks/:taskId/verify',
  VERIFICATION_GET: 'GET /tasks/:taskId/verification',

  // Export
  EXPORT_PREPARE: 'POST /tasks/:taskId/export/prepare',
  EXPORT_EXECUTE: 'POST /tasks/:taskId/export',
  EXPORT_GET: 'GET /exports/:id',

  // Health
  HEALTH_CHECK: 'GET /health',

  // WebSocket
  WS_CONNECT: 'WS /ws',
} as const;

// === Content Types ===
export const CONTENT_TYPES = {
  JSON: 'application/json',
  FORM: 'application/x-www-form-urlencoded',
  FORM_DATA: 'multipart/form-data',
  GECKO_JSON: 'application/gecko+json',
  VTT: 'text/vtt',
  SRT: 'application/x-subrip',
  PLAIN: 'text/plain',
} as const;

// === Headers ===
export const COMMON_HEADERS = {
  CONTENT_TYPE: 'Content-Type',
  AUTHORIZATION: 'Authorization',
  ACCEPT: 'Accept',
  CACHE_CONTROL: 'Cache-Control',
} as const;

// === Auth Header Helpers ===
export function createAuthHeader(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
  };
}

export function extractTokenFromHeader(header: string): string | null {
  const match = header.match(/^Bearer\s+(.+)$/);
  return match ? match[1] : null;
}

// === Pagination Defaults ===
export const PAGINATION_DEFAULTS = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
  MIN_LIMIT: 1,
} as const;
