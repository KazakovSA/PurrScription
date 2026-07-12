export const COMMENT_COLORS = [
  { id: "red", label: "Красный", color: "#ef4444" },
  { id: "amber", label: "Жёлтый", color: "#f59e0b" },
  { id: "green", label: "Зелёный", color: "#22c55e" },
  { id: "blue", label: "Синий", color: "#3b82f6" },
  { id: "violet", label: "Фиолетовый", color: "#8b5cf6" },
  { id: "cyan", label: "Бирюзовый", color: "#06b6d4" },
] as const;
export type CommentColorId = (typeof COMMENT_COLORS)[number]["id"];
export const DEFAULT_COMMENT_COLOR: CommentColorId = "blue";
export function commentColorHex(id: string | null | undefined): string {
  return COMMENT_COLORS.find((item) => item.id === id)?.color ?? "#3b82f6";
}
export interface TimelineComment {
  id: string;
  start: number;
  end: number | null;
  text: string;
  lane: "above" | "below";
  color: CommentColorId;
}
export interface WorkspaceLayoutPrefs {
  leftWidth: number;
  rightWidth: number;
  videoHeight: number;
  editorHeight: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  videoHidden: boolean;
  editorHidden: boolean;
}
export const defaultWorkspaceLayout = (): WorkspaceLayoutPrefs => ({
  leftWidth: 300,
  rightWidth: 320,
  videoHeight: 300,
  editorHeight: 240,
  leftCollapsed: false,
  rightCollapsed: false,
  videoHidden: false,
  editorHidden: false,
});
