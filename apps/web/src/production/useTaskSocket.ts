import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API_BASE, api } from "./api";
import { stableUserColor } from "./speaker";
import { useAppStore } from "./store";
import type {
  Envelope,
  Segment,
  SegmentLockState,
  SocketEvent,
  Task,
} from "./types";

export function useTaskSocket(taskId: string | undefined) {
  const qc = useQueryClient();
  const token = useAppStore((s) => s.session?.accessToken);
  const setConnection = useAppStore((s) => s.setConnection);
  const setPresence = useAppStore((s) => s.setPresence);
  const upsert = useAppStore((s) => s.upsertPresence);
  const remove = useAppStore((s) => s.removePresence);
  const clear = useAppStore((s) => s.clearPresence);
  const setLocks = useAppStore((s) => s.setLocks);
  const upsertLock = useAppStore((s) => s.upsertLock);
  const removeLock = useAppStore((s) => s.removeLock);

  useEffect(() => {
    if (!taskId || !token) return;

    let socket: WebSocket | null = null;
    let retry: number | undefined;
    let heartbeat: number | undefined;
    let offlineTimer: number | undefined;
    let closed = false;
    let attempt = 0;
    let lastConnection: "online" | "connecting" | "offline" = "connecting";

    const publishConnection = (next: "online" | "connecting" | "offline") => {
      if (next === lastConnection) return;
      lastConnection = next;
      setConnection(next);
    };

    const setConnectionDebounced = (
      next: "online" | "connecting" | "offline",
    ) => {
      if (next === "online") {
        if (offlineTimer) window.clearTimeout(offlineTimer);
        offlineTimer = undefined;
        publishConnection("online");
        return;
      }
      if (next === "connecting") {
        if (lastConnection === "online") return;
        publishConnection("connecting");
        return;
      }
      if (offlineTimer) window.clearTimeout(offlineTimer);
      offlineTimer = window.setTimeout(() => publishConnection("offline"), 450);
    };

    const connect = () => {
      setConnectionDebounced("connecting");
      const base = API_BASE.startsWith("http")
        ? API_BASE
        : window.location.origin + API_BASE;
      socket = new WebSocket(
        `${base.replace(/^http/, "ws").replace(/\/api$/, "")}/ws/tasks/${taskId}?token=${encodeURIComponent(token)}`,
      );

      socket.addEventListener("open", () => {
        attempt = 0;
        setConnectionDebounced("online");
        heartbeat = window.setInterval(
          () =>
            socket?.readyState === WebSocket.OPEN &&
            socket.send(JSON.stringify({ action: "heartbeat" })),
          30000,
        );
        void api<Envelope<SegmentLockState[]>>(`/tasks/${taskId}/locks`)
          .then((result) => setLocks(result.data))
          .catch(() => setLocks([]));
      });

      socket.addEventListener("message", (event) => {
        let m: SocketEvent;
        try {
          m = JSON.parse(event.data) as SocketEvent;
        } catch {
          return;
        }
        const d = m.data;
        if (m.type === "presence_updated" && Array.isArray(d.presence)) {
          setPresence(
            (d.presence as Array<Record<string, unknown>>).map((item) => ({
              userId: String(item.userId),
              userName: String(item.userName),
              role: String(item.role),
              color: stableUserColor(String(item.userId)),
              avatarUrl: item.avatarUrl ? String(item.avatarUrl) : null,
              focusedSegmentId: item.segmentId ? String(item.segmentId) : null,
            })),
          );
        }
        if (m.type === "user_joined") {
          upsert({
            userId: String(d.userId),
            userName: String(d.userName),
            role: String(d.role),
            color: stableUserColor(String(d.userId)),
            avatarUrl: d.avatarUrl ? String(d.avatarUrl) : null,
          });
        }
        if (m.type === "user_left") remove(String(d.userId));
        if (m.type === "segment_locked") {
          upsertLock({
            segmentId: String(d.segmentId),
            userId: String(d.userId),
            lockType: String(d.lockType) as "text" | "boundaries",
            expiresAt: String(d.expiresAt),
          });
        }
        if (m.type === "segment_unlocked")
          removeLock(String(d.segmentId), String(d.lockType));
        if (m.type === "segment_focused") {
          upsert({
            userId: String(d.userId),
            userName: String(d.userName),
            role: String(d.role),
            color: stableUserColor(String(d.userId)),
            focusedSegmentId: d.segmentId ? String(d.segmentId) : null,
            avatarUrl: d.avatarUrl ? String(d.avatarUrl) : null,
          });
        }
        if (m.type === "segment_updated" && d.segment) {
          qc.setQueryData<Segment[]>(["segments", taskId], (old) => {
            const n = d.segment as unknown as Segment;
            return old?.some((s) => s.id === n.id)
              ? old.map((s) => (s.id === n.id ? n : s))
              : [...(old || []), n].sort((a, b) => a.start - b.start);
          });
        }
        if (m.type === "segment_deleted" && d.segmentId) {
          qc.setQueryData<Segment[]>(["segments", taskId], (old) =>
            old?.filter((segment) => segment.id !== String(d.segmentId)),
          );
        }
        const nextStatus = d.status || d.to;
        if (m.type === "task_status_changed" && nextStatus) {
          qc.setQueryData<Task>(["task", taskId], (old) =>
            old
              ? { ...old, status: String(nextStatus) as Task["status"] }
              : old,
          );
        }
        if (
          [
            "marker_created",
            "marker_resolved",
            "comment_created",
            "comment_resolved",
            "quality_updated",
          ].includes(m.type)
        ) {
          qc.invalidateQueries({ queryKey: ["quality", taskId] });
          qc.invalidateQueries({ queryKey: ["task-markers", taskId] });
          qc.invalidateQueries({ queryKey: ["task-comments", taskId] });
        }
      });

      socket.addEventListener("close", () => {
        if (heartbeat) clearInterval(heartbeat);
        if (closed) return;
        setConnectionDebounced("offline");
        retry = window.setTimeout(
          connect,
          Math.min(32000, 1000 * 2 ** attempt++),
        );
      });

      socket.addEventListener("error", () => socket?.close());
    };

    connect();

    const focus = (event: Event) => {
      const segmentId = (event as CustomEvent<{ segmentId: string | null }>)
        .detail?.segmentId;
      if (socket?.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify({ action: "focus", segmentId }));
    };
    window.addEventListener("purrscription:focus-segment", focus);

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      if (heartbeat) clearInterval(heartbeat);
      if (offlineTimer) clearTimeout(offlineTimer);
      clear();
      setLocks([]);
      window.removeEventListener("purrscription:focus-segment", focus);
      socket?.close();
    };
  }, [
    taskId,
    token,
    qc,
    setConnection,
    setPresence,
    upsert,
    remove,
    clear,
    setLocks,
    upsertLock,
    removeLock,
  ]);
}
