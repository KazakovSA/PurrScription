import { useEffect, useRef } from "react";

import type { Segment, Task } from "./types";

const dataKey = (taskId: string) => `purrscription.ws-data.${taskId}`;

type Snapshot = { task: Task; segments: Segment[] };

export function readWorkspaceSnapshot(taskId?: string): Snapshot | null {
  if (!taskId) return null;
  try {
    const raw = sessionStorage.getItem(dataKey(taskId));
    if (!raw) return null;
    return JSON.parse(raw) as Snapshot;
  } catch {
    return null;
  }
}

export function writeWorkspaceSnapshot(
  taskId: string,
  task: Task,
  segments: Segment[],
) {
  try {
    sessionStorage.setItem(dataKey(taskId), JSON.stringify({ task, segments }));
  } catch {
    /* ignore quota */
  }
}

export function useStickyWorkspaceData(
  taskId: string | undefined,
  task: Task | undefined,
  segments: Segment[] | undefined,
) {
  const stickyRef = useRef<{ task?: Task; segments?: Segment[] }>({});

  if (!stickyRef.current.task || !stickyRef.current.segments?.length) {
    const snapshot = readWorkspaceSnapshot(taskId);
    if (snapshot)
      stickyRef.current = { task: snapshot.task, segments: snapshot.segments };
  }

  if (task) stickyRef.current.task = task;
  if (segments?.length) stickyRef.current.segments = segments;

  const stableTask = task ?? stickyRef.current.task;
  const stableSegments = segments ?? stickyRef.current.segments;

  useEffect(() => {
    if (taskId && stableTask && stableSegments?.length) {
      writeWorkspaceSnapshot(taskId, stableTask, stableSegments);
    }
  }, [taskId, stableTask, stableSegments]);

  return { task: stableTask, segments: stableSegments };
}
