import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FastForward,
  LocateFixed,
  MessageSquare,
  Pause,
  Play,
  Rewind,
  RotateCcw,
  Volume2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type WaveSurfer from "wavesurfer.js";
import type Regions from "wavesurfer.js/dist/plugins/regions.esm.js";
import { assetUrl } from "./api";
import { speakerColor } from "./speaker";
import { useAppStore } from "./store";
import type { Segment } from "./types";
import { useWaveformInit } from "./useWaveformInit";
import { peekWaveSession } from "./waveSession";
import {
  COMMENT_COLORS,
  commentColorHex,
  DEFAULT_COMMENT_COLOR,
  type CommentColorId,
  type TimelineComment,
} from "./workspaceTypes";
import type { PresenceMember } from "./types";

const formatTime = (value: number) => {
  const centiseconds = Math.max(0, Math.round(value * 100)),
    minutes = Math.floor(centiseconds / 6000),
    seconds = Math.floor((centiseconds % 6000) / 100),
    fraction = centiseconds % 100;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(fraction).padStart(2, "0")}`;
};
type Tool = "navigate" | "comment";
type TimelineGesture = {
  pointerId: number;
  start: number;
  current: number;
  startX: number;
};
interface Props {
  mediaId: string;
  mediaName: string;
  segments: Segment[];
  activeId: string | null;
  editable: boolean;
  videoHidden?: boolean;
  videoHeight?: number;
  comments: TimelineComment[];
  presence: PresenceMember[];
  onSelect: (id: string | null) => void;
  onBoundaryChange: (id: string, start: number, end: number) => Promise<void>;
  onCreate: (start: number, end: number) => Promise<void>;
  onAddComment: (comment: Omit<TimelineComment, "id">) => void;
  onRemoveComment: (id: string) => void;
  onTimeChange: (time: number) => void;
}
export const WaveformEditor = memo(function WaveformEditor({
  mediaId,
  mediaName,
  segments,
  activeId,
  editable,
  videoHidden,
  videoHeight = 220,
  comments,
  presence,
  onSelect,
  onBoundaryChange,
  onCreate,
  onAddComment,
  onRemoveComment,
  onTimeChange,
}: Props) {
  const container = useRef<HTMLDivElement>(null),
    mediaMountRef = useRef<HTMLDivElement>(null),
    videoPanelRef = useRef<HTMLDivElement>(null),
    timeOutputRef = useRef<HTMLOutputElement>(null),
    wave = useRef<WaveSurfer | null>(null),
    regions = useRef<Regions | null>(null),
    segmentRef = useRef(segments),
    toolRef = useRef<Tool>("navigate"),
    zoomRef = useRef(1),
    loopRef = useRef(false),
    followRef = useRef(true),
    activeIdRef = useRef<string | null>(null),
    paddingRef = useRef(0.3),
    onSelectRef = useRef(onSelect),
    onBoundaryRef = useRef(onBoundaryChange),
    onCreateRef = useRef(onCreate),
    stopAt = useRef<number | null>(null),
    lastTimeNotifyRef = useRef(0),
    gestureRef = useRef<TimelineGesture | null>(null),
    [ready, setReady] = useState(false),
    [loading, setLoading] = useState(0),
    [loadingStage, setLoadingStage] = useState(""),
    [error, setError] = useState(""),
    [playing, setPlaying] = useState(false),
    [duration, setDuration] = useState(0),
    [speed, setSpeed] = useState(1),
    [volume, setVolume] = useState(1),
    [zoom, setZoom] = useState(1),
    [tool, setTool] = useState<Tool>("navigate"),
    [commentColor, setCommentColor] = useState<CommentColorId>(
      DEFAULT_COMMENT_COLOR,
    ),
    [commentDraft, setCommentDraft] = useState(""),
    [pendingComment, setPendingComment] = useState<{
      start: number;
      end: number | null;
    } | null>(null),
    [loop, setLoop] = useState(false),
    [follow, setFollow] = useState(true),
    [padding, setPadding] = useState(0.3),
    [isVideo, setIsVideo] = useState(false);
  const [gapRange, setGapRange] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const [videoZoom, setVideoZoom] = useState(1);
  const [videoPan, setVideoPan] = useState({ x: 0, y: 0 });
  const setWorkspaceLayout = useAppStore((s) => s.setWorkspaceLayout),
    layoutVideoHeight = useAppStore((s) => s.workspaceLayout.videoHeight),
    currentUserId = useAppStore((s) => s.user?.id ?? null);
  segmentRef.current = segments;
  toolRef.current = tool;
  loopRef.current = loop;
  followRef.current = follow;
  activeIdRef.current = activeId;
  paddingRef.current = padding;
  onSelectRef.current = onSelect;
  onBoundaryRef.current = onBoundaryChange;
  onCreateRef.current = onCreate;
  const paintCurrentTime = (value: number) => {
    const now = performance.now();
    if (now - lastTimeNotifyRef.current >= 50) {
      lastTimeNotifyRef.current = now;
      onTimeChange(value);
    }
    const out = timeOutputRef.current;
    if (!out) return;
    const main = out.firstChild;
    if (main && main.nodeType === Node.TEXT_NODE)
      main.textContent = `${formatTime(value)} `;
  };
  const segmentsKey = useMemo(
    () =>
      segments
        .map((s) => `${s.id}:${s.start}:${s.end}:${s.speaker || ""}`)
        .join("|"),
    [segments],
  );
  useWaveformInit(
    mediaId,
    mediaName,
    {
      container,
      mediaMount: mediaMountRef,
      videoPanel: videoPanelRef,
      wave,
      regions,
      segmentRef,
      toolRef,
      zoomRef,
      loopRef,
      followRef,
      activeIdRef,
      paddingRef,
      onSelectRef,
      onBoundaryRef,
      onCreateRef,
      stopAt,
      paintCurrentTime,
    },
    {
      setError,
      setLoading,
      setLoadingStage,
      setReady,
      setPlaying,
      setDuration,
      setZoom,
      setIsVideo,
      setPendingComment,
      setTool,
    },
  );
  useEffect(() => {
    const seekTime = (event: Event) => {
      const detail = (
        event as CustomEvent<{ segmentId?: string; time?: number }>
      ).detail;
      if (detail?.time != null) {
        wave.current?.setTime(detail.time);
        wave.current?.setScrollTime(detail.time);
        return;
      }
      const segmentId = detail?.segmentId;
      const segment = segments.find((item) => item.id === segmentId);
      if (segment) {
        wave.current?.setTime(segment.start);
        wave.current?.setScrollTime(segment.start);
      }
    };
    window.addEventListener("purrscription:seek-time", seekTime);
    window.addEventListener("purrscription:seek-segment", seekTime);
    return () => {
      window.removeEventListener("purrscription:seek-time", seekTime);
      window.removeEventListener("purrscription:seek-segment", seekTime);
    };
  }, [segments]);

  useEffect(() => {
    if (videoZoom <= 1) setVideoPan({ x: 0, y: 0 });
  }, [videoZoom]);

  useEffect(() => {
    const host = container.current;
    if (!host) return;
    const scrollTimeline = (event: WheelEvent) => {
      const wrapper = wave.current?.getWrapper();
      if (!wrapper) return;
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const delta = event.deltaY > 0 ? -12 : 12;
        setZoom((current) => {
          const next = Math.min(500, Math.max(10, current + delta));
          zoomRef.current = next;
          wave.current?.zoom(next);
          return next;
        });
        return;
      }
      if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
      event.preventDefault();
      const zoomScale = Math.max(1, zoomRef.current / 60);
      wrapper.scrollLeft += event.deltaY * 0.35 / Math.sqrt(zoomScale);
    };
    host.addEventListener("wheel", scrollTimeline, { passive: false });
    return () => host.removeEventListener("wheel", scrollTimeline);
  }, [ready]);

  useEffect(() => {
    if (!ready || !regions.current) return;
    const plugin = regions.current;
    plugin.clearRegions();
    segments.forEach((segment) => {
      const color = speakerColor(segment.speaker);
      const region = plugin.addRegion({
        id: segment.id,
        start: segment.start,
        end: segment.end,
        color: color.soft,
        drag: false,
        resize: editable,
        resizeStart: editable,
        resizeEnd: editable,
        minLength: 0.1,
      });
      region.element?.classList.add("gecko-segment-region");
      region.element?.addEventListener("pointerdown", () => {
        setGapRange(null);
        onSelectRef.current(segment.id);
      });
      const selected = segment.id === activeIdRef.current;
      region.element?.classList.toggle("selected-region", selected);
      region.element?.style.setProperty("--region-color", color.solid);
      region.element?.style.setProperty("opacity", selected ? ".78" : ".58");
      const editors = presence.filter(
        (member) => member.focusedSegmentId === segment.id,
      );
      const others = editors.filter(
        (member) => member.userId !== currentUserId,
      );
      if (editors.length && region.element) {
        const highlight = others[0] ?? editors[0];
        region.element.style.setProperty(
          "box-shadow",
          `inset 0 0 0 2px ${highlight.color}, 0 0 0 2px ${highlight.color}`,
        );
        region.element.setAttribute(
          "title",
          `Сейчас здесь: ${editors.map((member) => member.userName).join(", ")}`,
        );
      }
      if (others.length && region.element) {
        region.element.style.setProperty("overflow", "visible");
        region.element.style.setProperty("opacity", "1");
        region.element.classList.add("has-presence");
        const badges = document.createElement("div");
        badges.className = "gecko-presence-badges";
        others.forEach((member) => {
          const badge = document.createElement("span");
          badge.className = "gecko-presence-badge";
          badge.style.setProperty("--presence-color", member.color);
          badge.title = `${member.userName} — редактирует этот сегмент`;
          const avatar = document.createElement("span");
          avatar.className = "gecko-presence-avatar";
          if (member.avatarUrl) {
            const img = document.createElement("img");
            img.src = assetUrl(member.avatarUrl);
            img.alt = "";
            avatar.appendChild(img);
          } else {
            avatar.textContent = member.userName
              .split(" ")
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();
          }
          const label = document.createElement("span");
          label.className = "gecko-presence-name";
          label.textContent = member.userName;
          badge.appendChild(avatar);
          badge.appendChild(label);
          badges.appendChild(badge);
        });
        region.element.appendChild(badges);
      }
    });
    comments.forEach((comment) => {
      const hex = commentColorHex(comment.color);
      const content = document.createElement("span");
      content.className = "gecko-comment-content";
      content.textContent = `💬 ${comment.text}`;
      content.title = `${formatTime(comment.start)} — ${comment.text} — правый клик: удалить`;
      content.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onRemoveComment(comment.id);
      });
      Object.assign(content.style, {
        position: "absolute",
        left: "3px",
        bottom: "5px",
        maxWidth: "220px",
        padding: "3px 6px",
        border: `1px solid ${hex}`,
        borderLeft: `4px solid ${hex}`,
        borderRadius: "5px",
        background: `${hex}1f`,
        color: "#1f2937",
        fontSize: "10px",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        pointerEvents: "auto",
      });
      const region = plugin.addRegion({
        id: `comment:${comment.id}`,
        start: comment.start,
        end: comment.end ?? Math.min(duration, comment.start + 0.04),
        color: comment.end ? `${hex}28` : "transparent",
        content,
        drag: false,
        resize: false,
      });
      region.element?.classList.add("gecko-comment-region");
      region.element?.style.setProperty("overflow", "visible");
      region.element?.style.setProperty("border", `1px solid ${hex}`);
    });
  }, [
    comments,
    currentUserId,
    duration,
    editable,
    presence,
    onRemoveComment,
    ready,
    segments,
    segmentsKey,
  ]);
  useEffect(() => {
    if (!ready || !regions.current) return;
    for (const region of regions.current.getRegions()) {
      if (region.id.includes(":") || region.id === "__annotation-draft__")
        continue;
      const segment = segments.find((item) => item.id === region.id);
      if (!segment) continue;
      const color = speakerColor(segment.speaker);
      const selected = region.id === activeId;
      region.setOptions({
        resize: editable,
        resizeStart: editable,
        resizeEnd: editable,
      });
      region.element?.classList.toggle("selected-region", selected);
      region.element?.style.setProperty(
        "border",
        `${selected ? 2 : 1}px solid ${color.solid}`,
      );
      region.element?.style.setProperty("opacity", selected ? ".78" : ".58");
    }
  }, [activeId, editable, ready, segments]);
  useEffect(() => {
    if (!regions.current || !ready || !editable || tool !== "navigate") return;
    const disable = regions.current.enableDragSelection({
      color: "rgba(198,104,44,.14)",
      minLength: 0.1,
    });
    return disable;
  }, [tool, editable, ready]);
  useEffect(() => {
    const wrapper = wave.current?.getWrapper();
    if (!wrapper || !ready) return;
    const selectGap = (event: MouseEvent) => {
      const rect = wrapper.getBoundingClientRect();
      const scrollWidth = wrapper.scrollWidth;
      const x = event.clientX - rect.left + wrapper.scrollLeft;
      const at = (x / Math.max(1, scrollWidth)) * duration;
      if (segments.some((segment) => at >= segment.start && at <= segment.end))
        return;
      const preceding = segments.filter((segment) => segment.end <= at);
      const before = preceding[preceding.length - 1];
      const after = segments.find((segment) => segment.start >= at);
      const start = before?.end ?? 0;
      const end = after?.start ?? duration;
      if (end - start < 0.01) return;
      setGapRange({ start, end });
      const plugin = regions.current;
      plugin
        ?.getRegions()
        .find((region) => region.id === "__gap-selection__")
        ?.remove();
      const region = plugin?.addRegion({
        id: "__gap-selection__",
        start,
        end,
        color: "rgba(240,138,36,.16)",
        drag: false,
        resize: false,
      });
      region?.element?.classList.add("gecko-gap-region");
    };
    wrapper.addEventListener("click", selectGap);
    return () => wrapper.removeEventListener("click", selectGap);
  }, [duration, onSelect, ready, segments]);
  useEffect(() => {
    wave.current?.setPlaybackRate(speed, true);
    const session = peekWaveSession(mediaId);
    if (session?.isVideo) session.video.playbackRate = speed;
  }, [speed, mediaId]);
  useEffect(() => {
    wave.current?.setVolume(volume);
    const session = peekWaveSession(mediaId);
    if (session?.isVideo) session.video.volume = volume;
  }, [volume, mediaId]);
  useEffect(() => {
    if (!ready) return;
    wave.current?.setOptions({ autoCenter: follow, autoScroll: follow });
  }, [follow, ready]);
  useEffect(() => {
    if (!wave.current || !ready) return;
    if (Math.abs(zoom - zoomRef.current) < 0.01) {
      return;
    }
    wave.current.zoom(zoom);
    zoomRef.current = zoom;
  }, [zoom, ready]);
  const changeZoom = useCallback(
    (delta: number) => setZoom((z) => Math.min(500, Math.max(10, z + delta))),
    [],
  );
  const active = segments.find((s) => s.id === activeId),
    speakers = useMemo(
      () =>
        Array.from(
          new Set(
            segments
              .map((s) => s.speaker)
              .filter((s): s is string => Boolean(s)),
          ),
        ),
      [segments],
    );
  const isPlaybackActive = useCallback(() => {
    const ws = wave.current,
      session = peekWaveSession(mediaId);
    if (!ws) return false;
    return (
      ws.isPlaying() ||
      Boolean(session?.isVideo && !session.video.paused && !session.video.ended)
    );
  }, [mediaId]);
  const syncVideoTime = useCallback(
    (time: number) => {
      const session = peekWaveSession(mediaId);
      if (!session?.isVideo) return;
      try {
        session.video.currentTime = time;
      } catch {
        /* ignore seek errors */
      }
    },
    [mediaId],
  );
  const togglePlay = useCallback(() => {
    const ws = wave.current;
    if (!ws) return;
    const session = peekWaveSession(mediaId);
    if (isPlaybackActive()) {
      ws.pause();
      session?.isVideo && session.video.pause();
      return;
    }
    let time = ws.getCurrentTime();
    if (loop && active) {
      const start = Math.max(0, active.start - padding);
      const end = Math.min(ws.getDuration(), active.end + padding);
      stopAt.current = end;
      if (time < start || time >= end) {
        time = start;
        ws.setTime(time);
      }
    }
    syncVideoTime(time);
    if (session?.isVideo) void session.video.play();
    void ws.play();
  }, [active, isPlaybackActive, loop, mediaId, padding, syncVideoTime]);
  const playSegment = useCallback(() => {
    if ((!active && !gapRange) || !wave.current) return;
    const ws = wave.current,
      session = peekWaveSession(mediaId),
      liveRegion = active
        ? regions.current
            ?.getRegions()
            .find((region) => region.id === active.id)
        : null,
      liveStart = gapRange?.start ?? liveRegion?.start ?? active!.start,
      liveEnd = gapRange?.end ?? liveRegion?.end ?? active!.end,
      start = Math.max(0, liveStart);
    stopAt.current = Math.min(ws.getDuration(), liveEnd);
    ws.setTime(start);
    syncVideoTime(start);
    if (session?.isVideo) void session.video.play();
    void ws.play();
  }, [active, gapRange, mediaId, syncVideoTime]);
  useEffect(() => {
    const instance = wave.current;
    if (!instance || !ready) return;
    if (!loop || !active) {
      stopAt.current = null;
      return;
    }
    const start = Math.max(0, active.start - padding);
    const end = Math.min(instance.getDuration(), active.end + padding);
    stopAt.current = end;
    const current = instance.getCurrentTime();
    if (instance.isPlaying() && (current < start || current >= end)) {
      instance.setTime(start);
      syncVideoTime(start);
    }
  }, [active, loop, padding, ready, syncVideoTime]);
  const pointerTimeAt = useCallback((clientX: number) => {
    const instance = wave.current;
    if (!instance) return 0;
    const wrapper = instance.getWrapper();
    const rect = wrapper.getBoundingClientRect();
    const width = Math.max(wrapper.scrollWidth, rect.width, 1);
    const x = clientX - rect.left + wrapper.scrollLeft;
    return Math.min(
      instance.getDuration(),
      Math.max(0, (x / width) * instance.getDuration()),
    );
  }, []);
  const beginAnnotation = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (tool === "navigate" || event.button !== 0 || !ready) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      const time = pointerTimeAt(event.clientX);
      const next = {
        pointerId: event.pointerId,
        start: time,
        current: time,
        startX: event.clientX,
      };
      gestureRef.current = next;
      const preview = regions.current?.addRegion({
        id: "__annotation-draft__",
        start: time,
        end: Math.min(duration, time + 0.01),
        color:
          tool === "comment" ? "rgba(59,130,246,.24)" : "rgba(198,104,44,.28)",
        drag: false,
        resize: false,
      });
      preview?.element?.classList.add("gecko-draft-region");
      preview?.element?.style.setProperty("border", "2px solid #3b82f6");
      preview?.element?.style.setProperty("opacity", ".9");
    },
    [duration, pointerTimeAt, ready, tool],
  );
  const moveAnnotation = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const current = gestureRef.current;
      if (!current || current.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const next = { ...current, current: pointerTimeAt(event.clientX) };
      gestureRef.current = next;
      regions.current
        ?.getRegions()
        .find((region) => region.id === "__annotation-draft__")
        ?.setOptions({
          start: Math.min(next.start, next.current),
          end: Math.max(next.start, next.current, next.start + 0.01),
        });
    },
    [pointerTimeAt],
  );
  const finishAnnotation = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const current = gestureRef.current;
      if (!current || current.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const end = pointerTimeAt(event.clientX);
      const moved = Math.abs(event.clientX - current.startX) >= 4;
      const startTime = Number(Math.min(current.start, end).toFixed(2));
      const endTime = Number(Math.max(current.start, end).toFixed(2));
      if (tool === "comment") {
        setPendingComment({
          start: startTime,
          end: moved && endTime - startTime >= 0.05 ? endTime : null,
        });
        setTool("navigate");
      }
      gestureRef.current = null;
      regions.current
        ?.getRegions()
        .find((region) => region.id === "__annotation-draft__")
        ?.remove();
    },
    [pointerTimeAt, tool],
  );
  const submitComment = useCallback(() => {
    if (!pendingComment || !commentDraft.trim()) return;
    onAddComment({
      start: pendingComment.start,
      end: pendingComment.end,
      text: commentDraft.trim(),
      lane: "below",
      color: commentColor,
    });
    setCommentDraft("");
    setPendingComment(null);
    setTool("navigate");
  }, [commentColor, commentDraft, onAddComment, pendingComment]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.matches('input,textarea,select,button,[contenteditable="true"]')
      )
        return;
      if (event.code === "Space") {
        event.preventDefault();
        event.shiftKey ? playSegment() : togglePlay();
      }
      if (event.key.toLowerCase() === "j") {
        event.preventDefault();
        wave.current?.skip(event.shiftKey ? -0.1 : -1);
      }
      if (event.key.toLowerCase() === "l") {
        event.preventDefault();
        wave.current?.skip(event.shiftKey ? 0.1 : 1);
      }
      if (event.key === "Escape") {
        wave.current?.stop();
        const session = peekWaveSession(mediaId);
        session?.isVideo && session.video.pause();
        stopAt.current = null;
        setPendingComment(null);
        setTool("navigate");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playSegment, togglePlay, mediaId]);
  return (
    <section
      className={`waveform-panel tool-${tool}`}
      aria-label="Аудиодорожка"
    >
      <div ref={mediaMountRef} className="media-mount" aria-hidden="true" />
      <div
        className="video-panel"
        style={
          {
            display: isVideo && !videoHidden ? "flex" : "none",
            height: isVideo ? videoHeight || layoutVideoHeight : 0,
            "--video-zoom": videoZoom,
            "--video-pan-x": `${videoPan.x}px`,
            "--video-pan-y": `${videoPan.y}px`,
          } as React.CSSProperties
        }
      >
        <div
          ref={videoPanelRef}
          className={`video-slot ${videoZoom > 1 ? "pannable" : ""}`}
          onWheel={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setVideoZoom((value) =>
              Math.min(
                5,
                Math.max(0.5, value + (event.deltaY < 0 ? 0.25 : -0.25)),
              ),
            );
          }}
          onPointerDown={(event) => {
            if (
              videoZoom <= 1 ||
              (event.target as HTMLElement).closest("button")
            )
              return;
            const startClient = { x: event.clientX, y: event.clientY };
            const startPan = videoPan;
            event.currentTarget.setPointerCapture(event.pointerId);
            const move = (e: React.PointerEvent<HTMLDivElement>) => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
              const bounds = e.currentTarget.getBoundingClientRect();
              const maxX = (bounds.width * (videoZoom - 1)) / 2;
              const maxY = (bounds.height * (videoZoom - 1)) / 2;
              setVideoPan({
                x: Math.max(
                  -maxX,
                  Math.min(maxX, startPan.x + e.clientX - startClient.x),
                ),
                y: Math.max(
                  -maxY,
                  Math.min(maxY, startPan.y + e.clientY - startClient.y),
                ),
              });
            };
            const node = event.currentTarget;
            node.onpointermove = move as unknown as typeof node.onpointermove;
            node.onpointerup = () => {
              node.onpointermove = null;
              node.onpointerup = null;
            };
          }}
        />
        {isVideo && !videoHidden && (
          <div className="video-zoom-tools" aria-label="Масштаб видео">
            <button
              type="button"
              aria-label="Отдалить видео"
              onClick={() =>
                setVideoZoom((value) => Math.max(0.5, value - 0.25))
              }
            >
              <ZoomOut size={16} />
            </button>
            <button
              type="button"
              className="video-zoom-value"
              title="Сбросить масштаб"
              onClick={() => {
                setVideoZoom(1);
                setVideoPan({ x: 0, y: 0 });
              }}
            >
              {Math.round(videoZoom * 100)}%
            </button>
            <button
              type="button"
              aria-label="Приблизить видео"
              onClick={() => setVideoZoom((value) => Math.min(5, value + 0.25))}
            >
              <ZoomIn size={16} />
            </button>
          </div>
        )}
        <div
          className="video-resize-handle"
          role="separator"
          aria-label="Высота видео"
          onPointerDown={(event) => {
            const startY = event.clientY,
              startH = videoHeight || layoutVideoHeight;
            const move = (e: PointerEvent) =>
              setWorkspaceLayout({
                videoHeight: Math.min(
                  520,
                  Math.max(140, startH + (e.clientY - startY)),
                ),
              });
            const up = () => {
              window.removeEventListener("pointermove", move);
              window.removeEventListener("pointerup", up);
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up, { once: true });
          }}
        />
      </div>
      <header className="waveform-header">
        <div>
          <b>{mediaName}</b>
          <small>
            {ready
              ? `${formatTime(duration)} · ${isVideo ? "видео + дорожка" : "аудио"}`
              : loadingStage
                ? `${loadingStage} ${loading}%`
                : `Загрузка ${loading}%`}
          </small>
        </div>
        <div className="speaker-legend" aria-label="Цвета спикеров">
          {speakers.map((s) => {
            const c = speakerColor(s);
            return (
              <span key={s}>
                <i style={{ background: c.solid }} />
                {s}
              </span>
            );
          })}
        </div>
      </header>
      {error && !ready && (
        <div className="media-error" role="alert">
          <b>Медиа недоступно</b>
          <span>{error}</span>
        </div>
      )}
      <div className="timeline-stack">
        <div
          className="annotation-viewport"
          onPointerDownCapture={beginAnnotation}
          onPointerMoveCapture={moveAnnotation}
          onPointerUpCapture={finishAnnotation}
          onPointerCancelCapture={() => {
            gestureRef.current = null;
            regions.current
              ?.getRegions()
              .find((region) => region.id === "__annotation-draft__")
              ?.remove();
          }}
        >
          <div className="timeline-sync">
            <div className="wave-stack">
              <div className="waveform-canvas" ref={container} />
            </div>
          </div>
        </div>
      </div>
      {pendingComment && (
        <div className="comment-compose">
          <b>
            {pendingComment.end
              ? `Комментарий ${formatTime(pendingComment.start)} — ${formatTime(pendingComment.end)}`
              : `Комментарий ${formatTime(pendingComment.start)}`}
          </b>
          <textarea
            autoFocus
            rows={2}
            value={commentDraft}
            onChange={(e) => setCommentDraft(e.target.value)}
            placeholder="Текст комментария"
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
          <div>
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                setPendingComment(null);
                setCommentDraft("");
              }}
            >
              Отмена
            </button>
            <button
              className="button primary"
              type="button"
              disabled={!commentDraft.trim()}
              onClick={submitComment}
            >
              Добавить
            </button>
          </div>
        </div>
      )}
      <div className="waveform-controls">
        <button
          className="icon-button"
          aria-label="Назад на одну секунду"
          onClick={() => wave.current?.skip(-1)}
        >
          <Rewind size={18} />
        </button>
        <button
          className="play-button"
          aria-label={playing ? "Пауза" : "Воспроизвести"}
          onClick={togglePlay}
          disabled={!ready}
        >
          {playing ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <button
          className="icon-button"
          aria-label="Вперёд на одну секунду"
          onClick={() => wave.current?.skip(1)}
        >
          <FastForward size={18} />
        </button>
        <output ref={timeOutputRef}>
          0:00.00 <span>/ {formatTime(duration)}</span>
        </output>
        <button
          className="button segment-play"
          onClick={playSegment}
          disabled={(!active && !gapRange) || !ready}
        >
          Играть сегмент
        </button>
        <button
          className={`button ${loop ? "active" : ""}`}
          aria-pressed={loop}
          onClick={() => setLoop((v) => !v)}
        >
          <RotateCcw size={15} />
          Повтор
        </button>
        <button
          className={`button ${follow ? "active" : ""}`}
          aria-pressed={follow}
          title="Автоматически держать курсор воспроизведения в видимой области"
          onClick={() => setFollow((value) => !value)}
        >
          <LocateFixed size={15} />
          Follow
        </button>
        <label className="zoom-field" aria-label="Масштаб дорожки">
          <button
            type="button"
            className="icon-button"
            aria-label="Уменьшить масштаб"
            onClick={() => changeZoom(-15)}
          >
            <ZoomOut size={15} />
          </button>
          <input
            type="range"
            min="10"
            max="500"
            step="5"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
          <button
            type="button"
            className="icon-button"
            aria-label="Увеличить масштаб"
            onClick={() => changeZoom(15)}
          >
            <ZoomIn size={15} />
          </button>
          <span>{zoom}px/с</span>
        </label>
        <label className="compact-field">
          Поля
          <select
            value={padding}
            onChange={(e) => setPadding(Number(e.target.value))}
          >
            {[0.3, 0.5, 0.75, 1].map((v) => (
              <option key={v} value={v}>
                {v} c
              </option>
            ))}
          </select>
        </label>
        <label className="compact-field">
          Скорость
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          >
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((v) => (
              <option key={v} value={v}>
                {v}×
              </option>
            ))}
          </select>
        </label>
        <label className="volume">
          <Volume2 size={16} />
          <input
            aria-label="Громкость"
            type="range"
            min="0"
            max="1"
            step=".05"
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
          />
        </label>
        {editable && (
          <div className="comment-tools">
            <button
              className={`button ${tool === "comment" ? "active" : ""}`}
              aria-pressed={tool === "comment"}
              title="Кликните по дорожке для комментария в точке или выделите диапазон"
              onClick={() =>
                setTool(tool === "comment" ? "navigate" : "comment")
              }
            >
              <MessageSquare size={15} />
              Комментарий
            </button>
            <div
              className="marker-colors"
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
          </div>
        )}
      </div>
    </section>
  );
});
