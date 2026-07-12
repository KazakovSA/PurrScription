import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  CloudOff,
  Download,
  ListChecks,
  MessageSquare,
  PanelLeft,
  PanelRight,
  ShieldCheck,
  Sparkles,
  Trash2,
  Video,
  Wifi,
  X,
} from "lucide-react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ApiError, api, assetUrl, downloadAuthenticated } from "./api";
import { CatPawLogo } from "./CatPawLogo";
import { roleLabels } from "./AppShell";
import { ResizablePanel } from "./ResizablePanel";
import { speakerColor, speakerInitials, stableUserColor } from "./speaker";
import { useAppStore } from "./store";
import type {
  Comment,
  Envelope,
  Paginated,
  QualityReport,
  ExportResult,
  Role,
  Segment,
  Task,
  TaskAssignment,
  User,
} from "./types";
import { EmptyState, ErrorState, Loading, Modal } from "./ui";
import { useTaskSocket } from "./useTaskSocket";
import { WaveformEditor } from "./WaveformEditor";
import {
  hydrateWorkspaceCache,
  workspaceInitialSegments,
  workspaceInitialTask,
} from "./hydrateWorkspaceCache";
import { useStickyWorkspaceData } from "./useStickyWorkspaceData";
import {
  isWorkspaceBootstrapped,
  markWorkspaceBootstrapped,
} from "./workspaceBootstrap";
import {
  COMMENT_COLORS,
  commentColorHex,
  DEFAULT_COMMENT_COLOR,
  type CommentColorId,
  type TimelineComment,
} from "./workspaceTypes";
import {
  canExportTask,
  canVerifyTask,
  defaultCapabilities,
  isReadOnlyWorkspace,
} from "./permissions";
import { HotkeysOverlay } from "./HotkeysOverlay";
import { analyzeSegments, submitReadiness } from "./segmentAnalysis";
import type { SegmentIssue } from "./segmentAnalysis";
import {
  CHECKLIST_ITEMS,
  VerifierChecklist,
  useVerifierChecklist,
} from "./VerifierChecklist";

const statusLabels: Record<string, string> = {
  new: "Новая",
  assigned: "Назначена",
  in_progress: "В работе",
  review: "На проверке",
  rework: "Доработка",
  fixed: "Исправлена",
  accepted: "Принята",
  exported: "Экспортирована",
};
const time = (value: number) => {
  const cs = Math.round(value * 100);
  return `${Math.floor(cs / 6000)}:${String(Math.floor((cs % 6000) / 100)).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
};
function commentsToTimeline(comments: Comment[]): TimelineComment[] {
  return comments
    .filter((comment) => comment.timeSeconds != null && !comment.resolved)
    .map((comment) => ({
      id: comment.id,
      start: comment.timeSeconds!,
      end: comment.timeEndSeconds ?? null,
      text: comment.text,
      lane: "below" as const,
      color: (comment.color ?? "blue") as TimelineComment["color"],
    }));
}

function TaskAssignmentPanel({ taskId }: { taskId: string }) {
  const qc = useQueryClient();
  const [userId, setUserId] = useState("");
  const [startSeconds, setStartSeconds] = useState("");
  const [endSeconds, setEndSeconds] = useState("");
  const [error, setError] = useState("");
  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => (await api<Envelope<User[]>>("/auth/users")).data,
    retry: false,
  });
  const assignments = useQuery({
    queryKey: ["task-assignments", taskId],
    queryFn: async () =>
      (await api<Envelope<TaskAssignment[]>>(`/tasks/${taskId}/assignments`))
        .data,
  });
  const createAssignment = async () => {
    if (!userId) return;
    setError("");
    try {
      await api(`/tasks/${taskId}/assignments`, {
        method: "POST",
        body: JSON.stringify({
          userId,
          startSeconds: startSeconds ? Number(startSeconds) : null,
          endSeconds: endSeconds ? Number(endSeconds) : null,
        }),
      });
      setStartSeconds("");
      setEndSeconds("");
      await assignments.refetch();
      await qc.invalidateQueries({ queryKey: ["task", taskId] });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось назначить диапазон",
      );
    }
  };
  const removeAssignment = async (assignmentId: string) => {
    setError("");
    try {
      await api(`/tasks/${taskId}/assignments/${assignmentId}`, {
        method: "DELETE",
      });
      await assignments.refetch();
      await qc.invalidateQueries({ queryKey: ["task", taskId] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось снять назначение");
    }
  };
  return (
    <section className="assignment-panel">
      <h3>Назначение диапазонов</h3>
      <p className="backend-note">
        Диапазоны не должны пересекаться между исполнителями.
      </p>
      {assignments.data?.map((item) => (
        <div className="assignment-row" key={item.id}>
          <div className="assignment-row-info">
            <span>{item.userName}</span>
            <small>
              {item.startSeconds != null || item.endSeconds != null
                ? `${item.startSeconds ?? 0}s — ${item.endSeconds ?? "∞"}s`
                : "Вся задача"}
            </small>
          </div>
          <button
            type="button"
            className="assignment-remove"
            title="Снять назначение"
            aria-label={`Снять назначение: ${item.userName}`}
            onClick={() => void removeAssignment(item.id)}
          >
            <X size={14} />
          </button>
        </div>
      ))}
      {users.data && (
        <label>
          Исполнитель
          <select value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Выберите пользователя</option>
            {users.data.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} ({roleLabels[user.role]})
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="assignment-range">
        <label>
          Начало (с)
          <input
            type="number"
            min={0}
            step={0.01}
            value={startSeconds}
            onChange={(e) => setStartSeconds(e.target.value)}
          />
        </label>
        <label>
          Конец (с)
          <input
            type="number"
            min={0}
            step={0.01}
            value={endSeconds}
            onChange={(e) => setEndSeconds(e.target.value)}
          />
        </label>
      </div>
      {error && <div className="inline-error">{error}</div>}
      <button
        className="button secondary"
        disabled={!userId}
        onClick={() => void createAssignment()}
      >
        Назначить диапазон
      </button>
    </section>
  );
}

function SegmentRail({
  segments,
  activeId,
  onSelect,
  onDelete,
  editable,
}: {
  segments: Segment[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (segment: Segment) => Promise<void>;
  editable: boolean;
}) {
  const [search, setSearch] = useState(""),
    activeRowRef = useRef<HTMLDivElement | null>(null),
    filtered = segments.filter((s) =>
      (s.text + " " + (s.speaker || ""))
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
  // Keep the active segment visible when playback (follow mode) advances it.
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeId]);
  return (
    <aside className="segment-rail">
      <header>
        <input
          aria-label="Поиск по сегментам"
          placeholder="Поиск текста"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </header>
      <div>
        {filtered.map((segment, index) => {
          const color = speakerColor(segment.speaker);
          const isActive = activeId === segment.id;
          return (
            <div
              key={segment.id}
              ref={isActive ? activeRowRef : null}
              className={`segment-rail-row ${isActive ? "active" : ""}`}
              style={{ "--speaker": color.solid } as React.CSSProperties}
            >
              <button
                className="segment-rail-select"
                onClick={() => onSelect(segment.id)}
              >
                <span className="segment-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span
                  className="speaker-token"
                  style={{ background: color.soft, color: color.text }}
                >
                  {speakerInitials(segment.speaker)}
                </span>
                <span>
                  <small>
                    {time(segment.start)} — {time(segment.end)}
                  </small>
                  <b>{segment.text || "Текст не заполнен"}</b>
                  <em>
                    {segment.speaker || "Спикер не указан"} ·{" "}
                    {Math.round(segment.confidence * 100)}%
                  </em>
                </span>
              </button>
              {editable && (
                <button
                  className="segment-rail-delete"
                  title="Удалить сегмент"
                  aria-label={`Удалить сегмент ${index + 1}`}
                  onClick={() => void onDelete(segment)}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          );
        })}
        {!filtered.length && (
          <EmptyState
            title="Ничего не найдено"
            description="Измените поисковый запрос."
          />
        )}
      </div>
    </aside>
  );
}

function ConflictDialog({
  local,
  server,
  onUseServer,
  onRetry,
  onClose,
}: {
  local: Segment;
  server: Segment;
  onUseServer: () => void;
  onRetry: (segment: Segment) => void;
  onClose: () => void;
}) {
  const [merged, setMerged] = useState(local.text);
  return (
    <Modal title="Конфликт версий" onClose={onClose}>
      <div className="conflict-grid">
        <section>
          <h3>Ваша версия</h3>
          <p>{local.text || "Пустой текст"}</p>
        </section>
        <section>
          <h3>Версия сервера</h3>
          <p>{server.text || "Пустой текст"}</p>
        </section>
      </div>
      <label>
        Объединённый текст
        <textarea
          rows={5}
          value={merged}
          onChange={(e) => setMerged(e.target.value)}
        />
      </label>
      <footer>
        <button className="button secondary" onClick={onUseServer}>
          Принять серверную
        </button>
        <button
          className="button primary"
          onClick={() =>
            onRetry({ ...local, text: merged, version: server.version })
          }
        >
          Сохранить объединённую
        </button>
      </footer>
    </Modal>
  );
}

function SegmentEditor({
  segment,
  segments,
  editable,
  onSaved,
  playbackTime,
  playing,
}: {
  segment: Segment;
  segments: Segment[];
  editable: boolean;
  onSaved: (segment: Segment) => void;
  playbackTime: number;
  playing: boolean;
}) {
  const [draft, setDraft] = useState(segment),
    [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle"),
    [message, setMessage] = useState(""),
    [conflict, setConflict] = useState<{
      local: Segment;
      server: Segment;
    } | null>(null);
  useEffect(() => {
    setDraft(segment);
    setSaved("idle");
    setMessage("");
  }, [segment]);
  const save = async (value = draft) => {
    const index = segments.findIndex((s) => s.id === value.id),
      prev = segments[index - 1],
      next = segments[index + 1];
    if (value.start < 0 || value.end - value.start < 0.1) {
      setMessage("Сегмент должен быть не короче 0,10 секунды.");
      return false;
    }
    if ((prev && value.start < prev.end) || (next && value.end > next.start)) {
      setMessage("Границы не должны пересекать соседние сегменты.");
      return false;
    }
    setSaved("saving");
    setMessage("");
    try {
      const result = (
        await api<Envelope<Segment>>(`/segments/${value.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            start: value.start,
            end: value.end,
            text: value.text,
            speaker: value.speaker,
            version: value.version,
          }),
        })
      ).data;
      setDraft(result);
      setSaved("saved");
      onSaved(result);
      return true;
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.code === "VERSION_MISMATCH" &&
        error.details?.currentSegment
      ) {
        setConflict({
          local: value,
          server: error.details.currentSegment as unknown as Segment,
        });
      }
      setSaved("error");
      setMessage(error instanceof Error ? error.message : "Ошибка сохранения");
      return false;
    }
  };
  const dirty =
    JSON.stringify([draft.text, draft.speaker, draft.start, draft.end]) !==
    JSON.stringify([segment.text, segment.speaker, segment.start, segment.end]);
  const setSegmentDirty = useAppStore((s) => s.setSegmentDirty);
  useEffect(() => {
    setSegmentDirty(dirty && editable);
    return () => setSegmentDirty(false);
  }, [dirty, editable, setSegmentDirty]);
  useEffect(() => {
    if (!editable || !dirty || saved === "saving") return;
    const timer = window.setTimeout(() => void save(), 900);
    return () => window.clearTimeout(timer);
    // save intentionally uses the draft captured by this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, dirty, editable, saved]);
  useEffect(() => {
    const flush = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          handled: boolean;
          done: (error?: unknown) => void;
        }>
      ).detail;
      detail.handled = true;
      if (!dirty) {
        detail.done();
        return;
      }
      void save()
        .then((ok) =>
          ok
            ? detail.done()
            : detail.done(
                new Error("Сначала исправьте ошибку сохранения сегмента"),
              ),
        )
        .catch(detail.done);
    };
    window.addEventListener("purrscription:flush-segment", flush);
    return () =>
      window.removeEventListener("purrscription:flush-segment", flush);
    // Re-register when the editable revision changes so flush exports that exact revision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, draft, segment, segments]);
  const tokens = draft.text.match(
    /[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*|[^\p{L}\p{N}]+/gu,
  ) ?? [draft.text];
  const wordCount = tokens.filter((token) =>
    /[\p{L}\p{N}]/u.test(token),
  ).length;
  const exactWords = (segment.wordTimings || []).filter(
    (word) =>
      word.type?.toUpperCase() !== "PUNCTUATION" &&
      typeof word.start === "number" &&
      typeof word.end === "number",
  );
  const isSpeaking =
    playing && playbackTime >= segment.start && playbackTime <= segment.end;
  const exactSpokenWord = exactWords.findIndex(
    (word) => playbackTime >= word.start! && playbackTime <= word.end!,
  );
  const spokenWord = isSpeaking
    ? exactSpokenWord >= 0
      ? exactSpokenWord
      : Math.min(
          wordCount - 1,
          Math.max(
            0,
            Math.floor(
              ((playbackTime - segment.start) /
                Math.max(0.01, segment.end - segment.start)) *
                wordCount,
            ),
          ),
        )
    : -1;
  return (
    <section className="segment-editor">
      <header>
        <div>
          <h2>Сегмент {segments.indexOf(segment) + 1}</h2>
          <span>
            v{segment.version} ·{" "}
            {dirty
              ? "есть несохранённые изменения"
              : saved === "saved"
                ? "сохранено"
                : "без изменений"}
          </span>
        </div>
        {segment.confidence < 0.7 && (
          <span className="confidence-warning">
            <AlertTriangle size={15} />
            Уверенность {Math.round(segment.confidence * 100)}%
          </span>
        )}
      </header>
      <label>
        Текст
        {isSpeaking && wordCount > 0 ? (
          <div className="segment-text-playback" aria-live="off">
            {(() => {
              let wordIndex = -1;
              return tokens.map((token, index) => {
                const isWord = /[\p{L}\p{N}]/u.test(token);
                if (isWord) wordIndex += 1;
                return (
                  <span
                    className={
                      isWord && wordIndex === spokenWord ? "playing-word" : ""
                    }
                    key={`${index}-${token}`}
                  >
                    {token}
                  </span>
                );
              });
            })()}
          </div>
        ) : (
          <textarea
            rows={4}
            value={draft.text}
            disabled={!editable}
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
          />
        )}
      </label>
      <div className="editor-fields">
        <label>
          Начало
          <input
            type="number"
            step=".01"
            min="0"
            value={draft.start}
            disabled={!editable}
            onChange={(e) =>
              setDraft({ ...draft, start: Number(e.target.value) })
            }
          />
        </label>
        <label>
          Конец
          <input
            type="number"
            step=".01"
            min=".1"
            value={draft.end}
            disabled={!editable}
            onChange={(e) =>
              setDraft({ ...draft, end: Number(e.target.value) })
            }
          />
        </label>
        <label className="speaker-field">
          Спикер
          <input
            list="speaker-options"
            value={draft.speaker || ""}
            disabled={!editable}
            onChange={(e) =>
              setDraft({ ...draft, speaker: e.target.value || null })
            }
          />
          <datalist id="speaker-options">
            {Array.from(
              new Set([
                ...segments.map((s) => s.speaker).filter(Boolean),
                "[CROSSTALK]",
                "[OVERLAP]",
                "[MUSIC]",
                "[SILENCE]",
              ]),
            ).map((value) => (
              <option key={value} value={value!} />
            ))}
          </datalist>
        </label>
      </div>
      {!editable && (
        <p className="permission-note">
          Для вашей роли или статуса задачи доступен только просмотр.
        </p>
      )}
      {message && <p className="inline-error">{message}</p>}
      {conflict && (
        <ConflictDialog
          local={conflict.local}
          server={conflict.server}
          onClose={() => setConflict(null)}
          onUseServer={() => {
            setDraft(conflict.server);
            onSaved(conflict.server);
            setConflict(null);
          }}
          onRetry={(value) => {
            setConflict(null);
            void save(value);
          }}
        />
      )}
    </section>
  );
}

function Inspector({
  task,
  segment,
  segments,
  duration,
  listenedRatio,
  quality,
  qualityChecking,
  comments,
  onRefresh,
  onComment,
  onTaskChanged,
  onSelectComment,
  onJumpToSegment,
}: {
  task: Task;
  segment: Segment | null;
  segments: Segment[];
  duration: number;
  listenedRatio: number;
  quality: QualityReport | undefined;
  qualityChecking: boolean;
  comments: Comment[];
  onRefresh: () => void;
  onComment: (comment: Comment) => void;
  onTaskChanged: () => void;
  onSelectComment: (segmentId: string) => void;
  onJumpToSegment: (segmentId: string, time?: number) => void;
}) {
  const user = useAppStore((s) => s.user)!,
    segmentDirty = useAppStore((s) => s.segmentDirty),
    qc = useQueryClient(),
    [tab, setTab] = useState<"quality" | "ai" | "checklist" | "comments">(
      "quality",
    ),
    [text, setText] = useState(""),
    [commentColor, setCommentColor] = useState<CommentColorId>(
      DEFAULT_COMMENT_COLOR,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const checklist = useVerifierChecklist(task.id, user.id);
  const aiIssues = useMemo<SegmentIssue[]>(
    () => analyzeSegments(segments, duration),
    [segments, duration],
  );
  const readiness = useMemo(
    () =>
      submitReadiness({
        segments,
        duration,
        comments,
        checklistComplete: checklist.allChecked,
        listenedRatio,
        hasUnsaved: segmentDirty,
      }),
    [
      segments,
      duration,
      comments,
      checklist.allChecked,
      listenedRatio,
      segmentDirty,
    ],
  );
  const blockers = readiness.filter((c) => c.blocking && !c.ok);
  const readyToSubmit = blockers.length === 0;
  const aiErrorCount = aiIssues.filter((i) => i.severity === "error").length;
  const createComment = async () => {
    if (!segment || !text.trim()) return;
    setBusy(true);
    setError("");
    try {
      const comment = (
        await api<Envelope<Comment>>("/comments", {
          method: "POST",
          body: JSON.stringify({
            segmentId: segment.id,
            text: text.trim(),
            timeSeconds: segment.start,
            color: commentColor,
          }),
        })
      ).data;
      onComment(comment);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };
  const resolveComment = async (commentId: string) => {
    setBusy(true);
    setError("");
    try {
      await api(`/comments/${commentId}/resolve`, { method: "POST" });
      await qc.invalidateQueries({ queryKey: ["task-comments", task.id] });
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };
  const transition = async (kind: "start" | "submit" | "accept" | "rework") => {
    setBusy(true);
    setError("");
    try {
      if (kind === "accept" || kind === "rework")
        await api(`/tasks/${task.id}/verify`, {
          method: "POST",
          body: JSON.stringify({
            result: kind === "accept" ? "accepted" : "rework",
            comment: text || undefined,
          }),
        });
      else
        await api(`/tasks/${task.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: kind === "start" ? "in_progress" : "review",
          }),
        });
      await qc.invalidateQueries({ queryKey: ["task", task.id] });
      onTaskChanged();
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };
  const canStart =
      ["admin", "supervisor", "annotator"].includes(user.role) &&
      task.status === "assigned",
    canSubmit =
      ["admin", "supervisor", "annotator"].includes(user.role) &&
      ["in_progress", "rework", "fixed"].includes(task.status),
    canVerify =
      canVerifyTask(user.role, task, user.id) && task.status === "review",
    canAssign = defaultCapabilities(user.role).assignTasks;
  return (
    <aside className="inspector">
      <div className="tabs" role="tablist">
        {(
          [
            ["quality", "Quality Gate"],
            ["ai", "AI-помощник"],
            ["checklist", "Чек-лист"],
            ["comments", "Комментарии"],
          ] as const
        ).map(([id, label]) => (
          <button
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "active" : ""}
            key={id}
            onClick={() => {
              setTab(id);
              setText("");
            }}
          >
            {label}
            {id === "ai" && aiErrorCount > 0 && (
              <span className="tab-badge">{aiErrorCount}</span>
            )}
            {id === "checklist" && (
              <span className="tab-badge muted">
                {checklist.checkedCount}/{CHECKLIST_ITEMS.length}
              </span>
            )}
          </button>
        ))}
      </div>
      {tab === "quality" && (
        <div className="inspector-body">
          <div className="quality-score">
            <strong>{quality?.score?.toFixed(1) ?? "—"}</strong>
            <span>из 100</span>
            <span
              className={`quality-state ${quality?.canExport ? "ready" : "blocked"}`}
            >
              {qualityChecking
                ? "Проверка…"
                : quality?.canExport
                  ? "Экспорт разрешён"
                  : quality
                    ? `Экспорт заблокирован · ${quality.blockers.length} блокеров`
                    : "Ещё не проверено"}
            </span>
          </div>
          <div className="quality-formula">
            <b>Формула оценки</b>
            <code>
              100 − 5×ошибочные границы − 5×пересечения − 10×критические маркеры
              − 5×чек-лист − 2×пустой текст − 1×низкая уверенность − 0,5×маркеры
              − 1×комментарии
            </code>
            <small>
              Минимум 0. Экспорт доступен после принятия задачи без блокеров
              quality gate.
            </small>
          </div>
          {canAssign && <TaskAssignmentPanel taskId={task.id} />}
          {quality?.checks.map((check) => (
            <div
              className={`quality-item ${check.passed ? "passed" : check.severity === "critical" || check.severity === "error" ? "blocker" : "warning"}`}
              key={check.id}
            >
              {check.passed ? <Check size={15} /> : <AlertTriangle size={15} />}
              <span>{check.message}</span>
            </div>
          ))}
          {quality?.blockers.map((item) => (
            <button
              className="quality-item blocker"
              key={item}
              onClick={() =>
                segment &&
                document
                  .querySelector(".segment-editor textarea")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              <AlertTriangle size={15} />
              {item}
            </button>
          ))}
          {quality?.warnings.map((item) => (
            <div className="quality-item warning" key={item}>
              <AlertTriangle size={15} />
              {item}
            </div>
          ))}
          {quality && !quality.blockers.length && !quality.warnings.length && (
            <p className="quality-ok">
              <Check size={16} />
              Автоматические проверки пройдены
            </p>
          )}
          <button
            className="button secondary full"
            disabled={qualityChecking}
            onClick={onRefresh}
          >
            {qualityChecking ? "Проверяем…" : "Перезапустить проверку"}
          </button>
          <div className="workflow-actions">
            {user.role === "verifier" && (
              <div className="verifier-guide">
                <strong>Проверка задачи</strong>
                <ol>
                  <li>
                    Прослушайте сегменты и проверьте текст, спикера и границы.
                  </li>
                  <li>Фиксируйте ошибки комментариями на нужном тайминге.</li>
                  <li>
                    Перезапустите Quality Gate и устраните блокирующие ошибки.
                  </li>
                  <li>
                    Примите задачу или верните её с обязательным пояснением.
                  </li>
                </ol>
                {task.status !== "review" && (
                  <small>
                    Решение станет доступно, когда аннотатор отправит задачу на
                    проверку.
                  </small>
                )}
              </div>
            )}
            {canStart && (
              <button
                className="button primary full"
                disabled={busy}
                onClick={() => transition("start")}
              >
                Начать работу
              </button>
            )}
            {(canSubmit || canVerify) && !readyToSubmit && (
              <div className="readiness-gate">
                <strong>
                  <AlertTriangle size={14} /> Не готово · {blockers.length}
                </strong>
                <ul>
                  {blockers.map((check) => (
                    <li key={check.key}>{check.label}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="readiness-gate-link"
                  onClick={() => setTab("checklist")}
                >
                  Открыть чек-лист проверки
                </button>
              </div>
            )}
            {canSubmit && (
              <button
                className="button primary full"
                disabled={busy || !readyToSubmit}
                title={
                  readyToSubmit
                    ? undefined
                    : "Устраните блокеры готовности перед отправкой"
                }
                onClick={() => transition("submit")}
              >
                Отправить на проверку
              </button>
            )}
            {canVerify && (
              <>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Комментарий верификатора"
                />
                <button
                  className="button primary full"
                  disabled={busy || !readyToSubmit}
                  title={
                    readyToSubmit
                      ? undefined
                      : "Завершите чек-лист и устраните блокеры перед приёмкой"
                  }
                  onClick={() => transition("accept")}
                >
                  <ShieldCheck size={15} />
                  Принять
                </button>
                <button
                  className="button danger full"
                  disabled={busy || !text.trim()}
                  title={
                    !text.trim()
                      ? "Укажите, что именно нужно исправить"
                      : undefined
                  }
                  onClick={() => transition("rework")}
                >
                  Вернуть на доработку
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {tab === "ai" && (
        <div className="inspector-body">
          <div className="ai-head">
            <Sparkles size={16} />
            <div>
              <strong>AI-помощник</strong>
              <small>
                Автоматический разбор расшифровки. Нажмите на подсказку, чтобы
                перейти к сегменту.
              </small>
            </div>
          </div>
          {aiIssues.length === 0 ? (
            <p className="quality-ok">
              <Check size={16} />
              Проблем не найдено — расшифровка выглядит чисто.
            </p>
          ) : (
            aiIssues.map((issue) => (
              <button
                key={issue.key}
                className={`ai-issue ${issue.severity}`}
                onClick={() =>
                  issue.segmentId &&
                  onJumpToSegment(issue.segmentId, issue.time)
                }
              >
                {issue.severity === "error" ? (
                  <AlertTriangle size={15} />
                ) : (
                  <Sparkles size={15} />
                )}
                <span>
                  <b>{issue.title}</b>
                  <em>{issue.detail}</em>
                </span>
              </button>
            ))
          )}
        </div>
      )}
      {tab === "checklist" && (
        <div className="inspector-body">
          <VerifierChecklist
            state={checklist.state}
            toggle={checklist.toggle}
            reset={checklist.reset}
            checkedCount={checklist.checkedCount}
            editable={
              !isReadOnlyWorkspace(user.role) &&
              !["accepted", "exported"].includes(task.status)
            }
          />
          <div className="readiness">
            <strong>Готовность к отправке</strong>
            {readiness.map((check) => (
              <div
                key={check.key}
                className={`readiness-item ${check.ok ? "ok" : check.blocking ? "blocker" : "warning"}`}
              >
                {check.ok ? (
                  <Check size={15} />
                ) : (
                  <AlertTriangle size={15} />
                )}
                <span>{check.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {tab === "comments" && (
        <div className="inspector-body">
          <p className="backend-note">
            Комментарии синхронизируются с таймлайном и видны всем участникам
            задачи.
          </p>
          {comments.map((c) => (
            <div
              className="thread-item thread-jump"
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => {
                onSelectComment(c.segmentId);
                window.dispatchEvent(
                  new CustomEvent("purrscription:seek-time", {
                    detail: {
                      segmentId: c.segmentId,
                      time: c.timeSeconds ?? undefined,
                    },
                  }),
                );
              }}
            >
              <span
                className="comment-avatar"
                style={{ background: stableUserColor(c.author.id) }}
                aria-hidden
              >
                {c.author.avatarUrl ? (
                  <img src={assetUrl(c.author.avatarUrl)} alt="" />
                ) : (
                  c.author.name.slice(0, 2).toUpperCase()
                )}
                {c.color && (
                  <i
                    className="comment-color-dot"
                    style={{ background: commentColorHex(c.color) }}
                  />
                )}
              </span>
              <span className="comment-copy">
                <b>{c.author.name}</b>
                <small className="comment-role">
                  {roleLabels[c.author.role]}
                </small>
                <p>{c.text}</p>
                <small>
                  {c.timeSeconds != null
                    ? `${time(c.timeSeconds)} · перейти к таймингу`
                    : "Перейти к сегменту"}
                </small>
              </span>
              {!c.resolved && (
                <button
                  className="comment-resolve"
                  disabled={busy}
                  onClick={(event) => {
                    event.stopPropagation();
                    void resolveComment(c.id);
                  }}
                >
                  Решено
                </button>
              )}
            </div>
          ))}
          {segment && (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Комментарий к сегменту"
              />
              <div
                className="marker-colors compose-colors"
                role="radiogroup"
                aria-label="Цвет комментария"
              >
                {COMMENT_COLORS.map((color) => (
                  <button
                    key={color.id}
                    type="button"
                    className={commentColor === color.id ? "active" : ""}
                    style={{ background: color.color }}
                    aria-label={color.label}
                    title={color.label}
                    onClick={() => setCommentColor(color.id)}
                  />
                ))}
              </div>
              <button
                className="button primary full"
                disabled={busy || !text.trim()}
                onClick={createComment}
              >
                <MessageSquare size={15} />
                Отправить
              </button>
            </>
          )}
        </div>
      )}
      {error && <p className="inline-error">{error}</p>}
    </aside>
  );
}

export function WorkspacePage() {
  const { id } = useParams(),
    navigate = useNavigate(),
    qc = useQueryClient(),
    user = useAppStore((s) => s.user),
    activeId = useAppStore((s) => s.activeSegmentId),
    select = useAppStore((s) => s.selectSegment),
    connection = useAppStore((s) => s.connection),
    presence = useAppStore((s) => s.presence),
    layout = useAppStore((s) => s.workspaceLayout),
    setWorkspaceLayout = useAppStore((s) => s.setWorkspaceLayout),
    [playbackTime, setPlaybackTime] = useState(0),
    [playing, setPlaying] = useState(false),
    [exporting, setExporting] = useState(false),
    [listenedRatio, setListenedRatio] = useState(0),
    maxListenedRef = useRef(0),
    bootstrappedRef = useRef(id ? isWorkspaceBootstrapped(id) : false);
  useEffect(() => {
    maxListenedRef.current = 0;
    setListenedRatio(0);
  }, [id]);
  useEffect(() => {
    hydrateWorkspaceCache(qc, id);
  }, [qc, id]);
  useTaskSocket(id);
  const workspaceQueryOpts = {
    staleTime: 30_000,
    gcTime: 30 * 60_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
  } as const;
  const task = useQuery({
      queryKey: ["task", id],
      enabled: !!id,
      initialData: workspaceInitialTask(id),
      ...workspaceQueryOpts,
      queryFn: async () => (await api<Envelope<Task>>(`/tasks/${id}`)).data,
    }),
    segments = useQuery({
      queryKey: ["segments", id],
      enabled: !!id,
      initialData: workspaceInitialSegments(id),
      ...workspaceQueryOpts,
      queryFn: async () =>
        (await api<Paginated<Segment>>(`/tasks/${id}/segments?limit=5000`))
          .data,
    }),
    quality = useQuery({
      queryKey: ["quality", id],
      enabled: !!id,
      staleTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      placeholderData: keepPreviousData,
      queryFn: async () =>
        (
          await api<Envelope<QualityReport>>(`/tasks/${id}/quality-check`, {
            method: "POST",
          })
        ).data,
    }),
    taskComments = useQuery({
      queryKey: ["task-comments", id],
      enabled: !!id,
      staleTime: 15_000,
      queryFn: async () =>
        (await api<Envelope<Comment[]>>(`/tasks/${id}/comments`)).data,
    }),
    taskAssignments = useQuery({
      queryKey: ["task-assignments", id],
      enabled: !!id,
      staleTime: 15_000,
      queryFn: async () =>
        (await api<Envelope<TaskAssignment[]>>(`/tasks/${id}/assignments`))
          .data,
    });
  const myRanges = useMemo(() => {
    if (!user || user.role !== "annotator") return [];
    return (taskAssignments.data ?? [])
      .filter(
        (item) =>
          item.userId === user.id &&
          (item.startSeconds != null || item.endSeconds != null),
      )
      .map((item) => ({
        start: item.startSeconds ?? -Infinity,
        end: item.endSeconds ?? Infinity,
      }));
  }, [taskAssignments.data, user]);
  if (task.data && segments.data && id) {
    bootstrappedRef.current = true;
    markWorkspaceBootstrapped(id);
  }
  const taskFromQuery = task.data ?? qc.getQueryData<Task>(["task", id]),
    segmentsFromQuery =
      segments.data ?? qc.getQueryData<Segment[]>(["segments", id]),
    { task: taskData, segments: segmentsData } = useStickyWorkspaceData(
      id,
      taskFromQuery,
      segmentsFromQuery,
    );
  const visibleSegments = useMemo(() => {
    if (!segmentsData || myRanges.length === 0) return segmentsData;
    return segmentsData.filter((segment) =>
      myRanges.some(
        (range) => segment.start < range.end && segment.end > range.start,
      ),
    );
  }, [segmentsData, myRanges]);
  const contentDuration = useMemo(
    () => (visibleSegments || []).reduce((max, s) => Math.max(max, s.end), 0),
    [visibleSegments],
  );
  const handleTimeChange = useCallback(
    (value: number) => {
      setPlaybackTime(value);
      if (value > maxListenedRef.current + 0.05) {
        maxListenedRef.current = value;
        if (contentDuration > 0)
          setListenedRatio(Math.min(1, value / contentDuration));
      }
    },
    [contentDuration],
  );
  const jumpToSegment = useCallback(
    (segmentId: string, time?: number) => {
      select(segmentId);
      window.dispatchEvent(
        new CustomEvent("purrscription:seek-time", {
          detail: { segmentId, time },
        }),
      );
    },
    [select],
  );
  useEffect(() => {
    if (
      visibleSegments?.length &&
      (!activeId || !visibleSegments.some((item) => item.id === activeId))
    ) {
      select(visibleSegments[0].id);
    } else if (!visibleSegments?.length && activeId) {
      select(null);
    }
  }, [activeId, visibleSegments, select]);
  const playbackFollowRef = useRef(false);
  const followSelect = useCallback(
    (segmentId: string) => {
      // Selection driven by playback follow: update the active segment (so the
      // transcript text tracks the playhead) without broadcasting presence focus,
      // which would otherwise spam the room and rebuild every waveform region.
      playbackFollowRef.current = true;
      select(segmentId);
    },
    [select],
  );
  useEffect(() => {
    if (playbackFollowRef.current) {
      playbackFollowRef.current = false;
      return;
    }
    window.dispatchEvent(
      new CustomEvent("purrscription:focus-segment", {
        detail: { segmentId: activeId },
      }),
    );
  }, [activeId]);
  const active = visibleSegments?.find((s) => s.id === activeId) || null,
    editable = Boolean(
      user &&
      taskData &&
      !isReadOnlyWorkspace(user.role) &&
      (user.role === "admin" ||
        user.role === "supervisor" ||
        (user.role === "verifier" &&
          taskData.status === "review" &&
          taskData.assignedTo !== user.id) ||
        (user.role === "annotator" && taskData.assignedTo === user.id)) &&
      !["accepted", "exported"].includes(taskData.status),
    );
  const updateCache = useCallback(
    (updated: Segment) => {
      qc.setQueryData<Segment[]>(["segments", id], (old) =>
        old?.map((s) => (s.id === updated.id ? updated : s)),
      );
      quality.refetch();
    },
    [qc, id, quality],
  );
  const boundary = useCallback(
    async (segmentId: string, start: number, end: number) => {
      const segment = qc
        .getQueryData<Segment[]>(["segments", id])
        ?.find((s) => s.id === segmentId);
      if (!segment) return;
      qc.setQueryData<Segment[]>(["segments", id], (old) =>
        old?.map((item) =>
          item.id === segmentId ? { ...item, start, end } : item,
        ),
      );
      try {
        const result = (
          await api<Envelope<Segment>>(`/segments/${segmentId}`, {
            method: "PATCH",
            body: JSON.stringify({ start, end, version: segment.version }),
          })
        ).data;
        updateCache(result);
      } catch (error) {
        await segments.refetch();
        if (error instanceof ApiError && error.code === "SEGMENT_OVERLAP")
          return;
        window.alert(
          error instanceof Error
            ? error.message
            : "Не удалось изменить границы сегмента",
        );
      }
    },
    [qc, id, updateCache, segments],
  );
  const create = useCallback(
    async (start: number, end: number) => {
      if (!id) return;
      try {
        const result = (
          await api<Envelope<Segment>>("/segments", {
            method: "POST",
            body: JSON.stringify({
              taskId: id,
              start,
              end,
              text: "",
              speaker: active?.speaker || null,
              confidence: 0,
            }),
          })
        ).data;
        qc.setQueryData<Segment[]>(["segments", id], (old) =>
          [...(old || []), result].sort((a, b) => a.start - b.start),
        );
        select(result.id);
        void quality.refetch();
      } catch (error) {
        await segments.refetch();
        if (error instanceof ApiError && error.code === "SEGMENT_OVERLAP")
          return;
        window.alert(
          error instanceof Error ? error.message : "Не удалось создать сегмент",
        );
      }
    },
    [id, active?.speaker, qc, quality, segments, select],
  );
  const addTimelineComment = useCallback(
    async (comment: Omit<TimelineComment, "id">) => {
      const segment =
        visibleSegments?.find(
          (item) => comment.start >= item.start && comment.start <= item.end,
        ) || active;
      if (!segment) return;
      try {
        await api("/comments", {
          method: "POST",
          body: JSON.stringify({
            segmentId: segment.id,
            text: comment.text,
            timeSeconds: comment.start,
            timeEndSeconds: comment.end,
            color: comment.color,
          }),
        });
        await Promise.all([taskComments.refetch(), quality.refetch()]);
      } catch (error) {
        window.alert(
          error instanceof Error
            ? error.message
            : "Комментарий не сохранён на сервере",
        );
      }
    },
    [active, quality, visibleSegments, taskComments],
  );
  const removeTimelineComment = useCallback(
    async (commentId: string) => {
      try {
        await api(`/comments/${commentId}/resolve`, { method: "POST" });
        await taskComments.refetch();
      } catch (error) {
        window.alert(
          error instanceof Error
            ? error.message
            : "Не удалось удалить комментарий",
        );
      }
    },
    [taskComments],
  );
  const timelineComments = commentsToTimeline(taskComments.data || []);
  const split = async (segment: Segment, at: number) => {
    if (at - segment.start < 0.1 || segment.end - at < 0.1) return;
    try {
      const { first, second } = (
        await api<Envelope<{ first: Segment; second: Segment }>>(
          `/segments/${segment.id}/split`,
          {
            method: "POST",
            body: JSON.stringify({ at, version: segment.version }),
          },
        )
      ).data;
      qc.setQueryData<Segment[]>(["segments", id], (old) =>
        [
          ...(old || []).map((s) => (s.id === first.id ? first : s)),
          second,
        ].sort((a, b) => a.start - b.start),
      );
      select(second.id);
      void quality.refetch();
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Не удалось разделить сегмент",
      );
    }
  };
  const removeSegment = useCallback(
    async (segment: Segment) => {
      if (
        !window.confirm(
          "Удалить выбранный сегмент? Это действие нельзя отменить.",
        )
      )
        return;
      await api(`/segments/${segment.id}`, { method: "DELETE" });
      const current = qc.getQueryData<Segment[]>(["segments", id]) || [];
      const index = current.findIndex((item) => item.id === segment.id);
      const remaining = current.filter((item) => item.id !== segment.id);
      qc.setQueryData(["segments", id], remaining);
      select(remaining[Math.min(index, remaining.length - 1)]?.id ?? null);
      await quality.refetch();
    },
    [id, qc, quality, select],
  );
  if (!user) return <Navigate to="/login" replace />;
  if (
    !bootstrappedRef.current &&
    ((!taskData && task.isPending) || (!segmentsData && segments.isPending))
  )
    return (
      <div className="workspace-loading">
        <Loading label="Открываем рабочее место" />
      </div>
    );
  if ((task.error || segments.error) && !taskData && !segmentsData)
    return (
      <div className="workspace-loading">
        <ErrorState
          error={task.error || segments.error}
          onRetry={() => {
            task.refetch();
            segments.refetch();
          }}
        />
      </div>
    );
  if (!taskData || !segmentsData) return <Navigate to="/tasks" replace />;
  return (
    <div className="workspace">
      <header className="workspace-topbar">
        <button
          className="icon-button"
          aria-label="К списку задач"
          onClick={() => navigate("/tasks")}
        >
          <ArrowLeft size={18} />
        </button>
        <div className="brand-mini">
          <CatPawLogo compact />
        </div>
        <div className="breadcrumbs">
          Задачи <ChevronRight size={14} />
          <b>{taskData.name}</b>
        </div>
        <span className={`task-status status-${taskData.status}`}>
          {statusLabels[taskData.status]}
        </span>
        <div className="workspace-layout-toggles">
          {user && canExportTask(user.role) && (
            <button
              className="button export-button"
              disabled={exporting}
              onClick={async () => {
                if (!id) return;
                setExporting(true);
                try {
                  await new Promise<void>((resolve, reject) => {
                    const detail = {
                      handled: false,
                      done: (error?: unknown) =>
                        error ? reject(error) : resolve(),
                    };
                    window.dispatchEvent(
                      new CustomEvent("purrscription:flush-segment", {
                        detail,
                      }),
                    );
                    if (!detail.handled) resolve();
                  });
                  await qc.invalidateQueries({ queryKey: ["segments", id] });
                  await quality.refetch();
                  const result = (
                    await api<Envelope<ExportResult>>(`/tasks/${id}/export`, {
                      method: "POST",
                      body: JSON.stringify({ format: "json" }),
                    })
                  ).data;
                  await downloadAuthenticated(
                    result.url,
                    `${taskData.name}-gecko.json`,
                  );
                } catch (error) {
                  const message =
                    error instanceof ApiError
                      ? error.details?.blockers
                        ? `${error.message}\n${(error.details.blockers as string[]).join("\n")}`
                        : error.message
                      : error instanceof Error
                        ? error.message
                        : "Не удалось экспортировать";
                  window.alert(message);
                } finally {
                  setExporting(false);
                }
              }}
            >
              <Download size={15} />
              {exporting ? "Экспорт…" : "Экспорт"}
            </button>
          )}
          <button
            className="icon-button"
            aria-label="Панель сегментов"
            title="Панель сегментов"
            onClick={() =>
              setWorkspaceLayout({ leftCollapsed: !layout.leftCollapsed })
            }
          >
            <PanelLeft size={16} />
          </button>
          <button
            className="icon-button"
            aria-label="Видео"
            title="Видео"
            onClick={() =>
              setWorkspaceLayout({ videoHidden: !layout.videoHidden })
            }
          >
            <Video size={16} />
          </button>
          <button
            className="icon-button"
            aria-label="Инспектор"
            title="Инспектор"
            onClick={() =>
              setWorkspaceLayout({ rightCollapsed: !layout.rightCollapsed })
            }
          >
            <PanelRight size={16} />
          </button>
        </div>
        {presence.length > 0 && (
          <div className="presence" aria-label="Участники онлайн">
            <div className="presence-stack">
              {presence.map((member) => (
                <span
                  key={member.userId}
                  style={{ background: member.color }}
                  title={`${member.userName}, ${roleLabels[member.role as Role] ?? member.role}`}
                >
                  {member.avatarUrl ? (
                    <img src={assetUrl(member.avatarUrl)} alt="" />
                  ) : (
                    member.userName
                      .split(" ")
                      .map((p) => p[0])
                      .join("")
                      .slice(0, 2)
                  )}
                </span>
              ))}
            </div>
            <div className="presence-popover" role="list">
              <p className="presence-popover-title">
                Онлайн · {presence.length}
              </p>
              {presence.map((member) => (
                <div
                  className="presence-popover-row"
                  role="listitem"
                  key={member.userId}
                >
                  <span
                    className="presence-popover-avatar"
                    style={{ background: member.color }}
                    aria-hidden
                  >
                    {member.avatarUrl ? (
                      <img src={assetUrl(member.avatarUrl)} alt="" />
                    ) : (
                      member.userName
                        .split(" ")
                        .map((p) => p[0])
                        .join("")
                        .slice(0, 2)
                    )}
                  </span>
                  <span className="presence-popover-info">
                    <b>{member.userName}</b>
                    <small>
                      {roleLabels[member.role as Role] ?? member.role}
                    </small>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className={`connection ${connection}`}>
          {connection === "online" ? (
            <Wifi size={15} />
          ) : (
            <CloudOff size={15} />
          )}{" "}
          {connection === "online"
            ? "Онлайн"
            : connection === "connecting"
              ? "Подключение"
              : "Офлайн"}
        </div>
        <div className="current-user">
          {user.name} · {roleLabels[user.role]}
        </div>
      </header>
      <div className="workspace-layout">
        <ResizablePanel
          axis="x"
          size={layout.leftWidth}
          min={210}
          max={480}
          collapsed={layout.leftCollapsed}
          collapseSide="start"
          label={`Сегменты · ${visibleSegments?.length ?? 0}`}
          onResize={(leftWidth) => setWorkspaceLayout({ leftWidth })}
          onToggleCollapse={() =>
            setWorkspaceLayout({ leftCollapsed: !layout.leftCollapsed })
          }
          className="segment-rail-panel"
        >
          <SegmentRail
            segments={visibleSegments || []}
            activeId={activeId}
            onSelect={select}
            onDelete={removeSegment}
            editable={editable}
          />
        </ResizablePanel>
        <main className="workspace-main">
          <WaveformEditor
            mediaId={taskData.mediaFileId}
            mediaName={taskData.name}
            segments={visibleSegments || []}
            activeId={activeId}
            editable={editable}
            videoHidden={layout.videoHidden}
            videoHeight={layout.videoHeight}
            comments={timelineComments}
            presence={presence}
            onTimeChange={handleTimeChange}
            onPlayingChange={setPlaying}
            onSelect={select}
            onFollowSelect={followSelect}
            onBoundaryChange={boundary}
            onCreate={create}
            onAddComment={addTimelineComment}
            onRemoveComment={removeTimelineComment}
            onDeleteSegment={removeSegment}
            onSplitSegment={(segment) =>
              split(
                segment,
                Number(((segment.start + segment.end) / 2).toFixed(2)),
              )
            }
            onSaveSegment={() => {
              const detail = { handled: false, done: () => {} };
              window.dispatchEvent(
                new CustomEvent("purrscription:flush-segment", { detail }),
              );
            }}
          />
          {active && visibleSegments?.length && !layout.editorHidden ? (
            <ResizablePanel
              axis="y"
              size={layout.editorHeight}
              min={160}
              max={420}
              collapseSide="end"
              label="Редактор"
              onResize={(editorHeight) => setWorkspaceLayout({ editorHeight })}
              onToggleCollapse={() =>
                setWorkspaceLayout({ editorHidden: !layout.editorHidden })
              }
              className="editor-panel"
            >
              <SegmentEditor
                key={active.id}
                segment={active}
                segments={visibleSegments}
                editable={editable}
                onSaved={updateCache}
                playbackTime={playbackTime}
                playing={playing}
              />
            </ResizablePanel>
          ) : layout.editorHidden && active && visibleSegments?.length ? (
            <button
              className="panel-expand editor-expand"
              type="button"
              onClick={() => setWorkspaceLayout({ editorHidden: false })}
            >
              Показать редактор
            </button>
          ) : null}
          {!visibleSegments?.length ? (
            <div className="workspace-empty-hint">
              <EmptyState
                title={
                  myRanges.length
                    ? "В вашем диапазоне нет сегментов"
                    : "Сегментов пока нет"
                }
                description={
                  myRanges.length
                    ? "Вам назначен участок времени, но в нём пока нет сегментов."
                    : editable
                      ? "Нажмите «Сегмент» на дорожке и выделите диапазон, либо повторно импортируйте Gecko JSON."
                      : "В задаче нет сегментов."
                }
              />
            </div>
          ) : null}
        </main>
        <ResizablePanel
          axis="x"
          size={layout.rightWidth}
          min={240}
          max={480}
          collapsed={layout.rightCollapsed}
          collapseSide="end"
          label="Инспектор"
          onResize={(rightWidth) => setWorkspaceLayout({ rightWidth })}
          onToggleCollapse={() =>
            setWorkspaceLayout({ rightCollapsed: !layout.rightCollapsed })
          }
          className="inspector-panel"
        >
          <Inspector
            task={taskData}
            segment={active}
            segments={visibleSegments || []}
            duration={contentDuration}
            listenedRatio={listenedRatio}
            quality={quality.data}
            qualityChecking={quality.isFetching}
            comments={taskComments.data || []}
            onRefresh={() => quality.refetch()}
            onComment={() => {
              void taskComments.refetch();
              void quality.refetch();
            }}
            onTaskChanged={() => task.refetch()}
            onSelectComment={select}
            onJumpToSegment={jumpToSegment}
          />
        </ResizablePanel>
      </div>
      <HotkeysOverlay />
    </div>
  );
}
