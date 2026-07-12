import { create } from "zustand";
import type {
  AuthSession,
  PresenceMember,
  SegmentLockState,
  User,
} from "./types";
import {
  defaultWorkspaceLayout,
  type WorkspaceLayoutPrefs,
} from "./workspaceTypes";
const KEY = "purrscription.session",
  LAYOUT_KEY = "purrscription.workspace-layout.v2";
function restore(): AuthSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}
function restoreLayout(): WorkspaceLayoutPrefs {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    return raw
      ? { ...defaultWorkspaceLayout(), ...JSON.parse(raw) }
      : defaultWorkspaceLayout();
  } catch {
    return defaultWorkspaceLayout();
  }
}
interface State {
  session: AuthSession | null;
  user: User | null;
  activeSegmentId: string | null;
  segmentDirty: boolean;
  connection: "connecting" | "online" | "offline";
  presence: PresenceMember[];
  locks: SegmentLockState[];
  workspaceLayout: WorkspaceLayoutPrefs;
  setSession: (v: AuthSession) => void;
  clearSession: () => void;
  selectSegment: (id: string | null) => void;
  setSegmentDirty: (v: boolean) => void;
  setConnection: (v: State["connection"]) => void;
  setPresence: (members: PresenceMember[]) => void;
  upsertPresence: (v: PresenceMember) => void;
  removePresence: (id: string) => void;
  clearPresence: () => void;
  setLocks: (locks: SegmentLockState[]) => void;
  upsertLock: (lock: SegmentLockState) => void;
  removeLock: (segmentId: string, lockType: string) => void;
  setWorkspaceLayout: (patch: Partial<WorkspaceLayoutPrefs>) => void;
}
const initial = restore();
document.documentElement.removeAttribute("data-theme");
localStorage.removeItem("purrscription.theme");
export const useAppStore = create<State>((set) => ({
  session: initial,
  user: initial?.user ?? null,
  activeSegmentId: null,
  segmentDirty: false,
  connection: "offline",
  presence: [],
  locks: [],
  workspaceLayout: restoreLayout(),
  setSession: (session) => {
    sessionStorage.setItem(KEY, JSON.stringify(session));
    set({ session, user: session.user });
  },
  clearSession: () => {
    sessionStorage.removeItem(KEY);
    set({
      session: null,
      user: null,
      presence: [],
      locks: [],
      connection: "offline",
    });
  },
  selectSegment: (activeSegmentId) => set({ activeSegmentId }),
  setSegmentDirty: (segmentDirty) => set({ segmentDirty }),
  setConnection: (connection) => set({ connection }),
  setPresence: (members) =>
    set(() => ({
      presence: [...members].sort((a, b) => a.userId.localeCompare(b.userId)),
    })),
  upsertPresence: (v) =>
    set((s) => {
      // Merge in place and keep a stable (userId) order so avatars never reshuffle
      // or flicker while other events (focus/join) stream in.
      const existing = s.presence.find((p) => p.userId === v.userId);
      const merged = existing ? { ...existing, ...v } : v;
      return {
        presence: [
          ...s.presence.filter((p) => p.userId !== v.userId),
          merged,
        ].sort((a, b) => a.userId.localeCompare(b.userId)),
      };
    }),
  removePresence: (id) =>
    set((s) => ({ presence: s.presence.filter((p) => p.userId !== id) })),
  clearPresence: () => set({ presence: [] }),
  setLocks: (locks) => set({ locks }),
  upsertLock: (lock) =>
    set((state) => ({
      locks: [
        ...state.locks.filter(
          (item) =>
            item.segmentId !== lock.segmentId ||
            item.lockType !== lock.lockType,
        ),
        lock,
      ],
    })),
  removeLock: (segmentId, lockType) =>
    set((state) => ({
      locks: state.locks.filter(
        (item) => item.segmentId !== segmentId || item.lockType !== lockType,
      ),
    })),
  setWorkspaceLayout: (patch) =>
    set((s) => {
      const workspaceLayout = { ...s.workspaceLayout, ...patch };
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(workspaceLayout));
      return { workspaceLayout };
    }),
}));
export const getAccessToken = () =>
  useAppStore.getState().session?.accessToken ?? null;
