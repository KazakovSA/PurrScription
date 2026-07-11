import type { QueryClient } from "@tanstack/react-query";

import type { Segment, Task } from "./types";
import { readWorkspaceSnapshot } from "./useStickyWorkspaceData";

export function hydrateWorkspaceCache(qc: QueryClient, taskId?: string) {
  if (!taskId) return;
  const snap = readWorkspaceSnapshot(taskId);
  if (!snap) return;
  if (!qc.getQueryData(["task", taskId])) {
    qc.setQueryData(["task", taskId], snap.task);
  }
  if (!qc.getQueryData(["segments", taskId])) {
    qc.setQueryData(["segments", taskId], snap.segments);
  }
}

export function workspaceInitialTask(taskId?: string): Task | undefined {
  return readWorkspaceSnapshot(taskId)?.task;
}

export function workspaceInitialSegments(
  taskId?: string,
): Segment[] | undefined {
  return readWorkspaceSnapshot(taskId)?.segments;
}
