import { useEffect } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import WaveSurfer from "wavesurfer.js";
import Hover from "wavesurfer.js/dist/plugins/hover.esm.js";
import Regions from "wavesurfer.js/dist/plugins/regions.esm.js";
import Timeline from "wavesurfer.js/dist/plugins/timeline.esm.js";

import { prepareWaveformMedia } from "./api";
import type { Segment } from "./types";
import { clampNewSegmentBounds, clampSegmentBounds } from "./segmentBounds";
import {
  fitZoomPxPerSec,
  geckoWaveOptions,
  mergeWavePeaks,
  readWaveColors,
} from "./waveTheme";
import {
  bindWaveSession,
  clearOtherWaveSessions,
  getWaveSession,
  mountWaveNodes,
  reuseWaveSession,
} from "./waveSession";

type Tool = "navigate" | "comment";

type InitRefs = {
  container: MutableRefObject<HTMLDivElement | null>;
  mediaMount: MutableRefObject<HTMLDivElement | null>;
  videoPanel: MutableRefObject<HTMLDivElement | null>;
  wave: MutableRefObject<WaveSurfer | null>;
  regions: MutableRefObject<Regions | null>;
  segmentRef: MutableRefObject<Segment[]>;
  toolRef: MutableRefObject<Tool>;
  zoomRef: MutableRefObject<number>;
  loopRef: MutableRefObject<boolean>;
  followRef: MutableRefObject<boolean>;
  activeIdRef: MutableRefObject<string | null>;
  paddingRef: MutableRefObject<number>;
  onSelectRef: MutableRefObject<(id: string | null) => void>;
  onBoundaryRef: MutableRefObject<
    (id: string, start: number, end: number) => Promise<void>
  >;
  onCreateRef: MutableRefObject<(start: number, end: number) => Promise<void>>;
  stopAt: MutableRefObject<number | null>;
  paintCurrentTime: (value: number) => void;
};

type InitSetters = {
  setError: Dispatch<SetStateAction<string>>;
  setLoading: Dispatch<SetStateAction<number>>;
  setLoadingStage: Dispatch<SetStateAction<string>>;
  setReady: Dispatch<SetStateAction<boolean>>;
  setPlaying: Dispatch<SetStateAction<boolean>>;
  setDuration: Dispatch<SetStateAction<number>>;
  setZoom: Dispatch<SetStateAction<number>>;
  setIsVideo: Dispatch<SetStateAction<boolean>>;
  setPendingComment: Dispatch<
    SetStateAction<{ start: number; end: number | null } | null>
  >;
  setTool: Dispatch<SetStateAction<Tool>>;
};

type RegionBounds = {
  id: string;
  start: number;
  end: number;
  setOptions: (options: { start: number; end: number }) => void;
  remove: () => void;
};

function attachWaveHandlers(
  instance: WaveSurfer,
  regionPlugin: Regions,
  session: ReturnType<typeof getWaveSession>,
  refs: InitRefs,
  setters: InitSetters,
) {
  const syncPlaying = () => {
    const videoActive =
      session.isVideo && !session.video.paused && !session.video.ended;
    setters.setPlaying(instance.isPlaying() || videoActive);
  };

  const syncVideo = (time: number) => {
    if (!session.isVideo) return;
    const video = session.video;
    if (instance.isPlaying() && video.paused) {
      try {
        video.currentTime = time;
      } catch {
        /* ignore seek errors during buffer */
      }
      void video.play().catch(() => {});
      return;
    }
    if (video.paused && !instance.isPlaying()) return;
    if (Math.abs(video.currentTime - time) > 0.15) {
      try {
        video.currentTime = time;
      } catch {
        /* ignore seek errors during buffer */
      }
    }
  };

  const applyRegionBounds = (region: RegionBounds, start: number, end: number) => {
    const duration = instance.getDuration();
    const clamped = clampSegmentBounds(
      region.id,
      start,
      end,
      refs.segmentRef.current,
      duration,
    );
    if (
      Math.abs(clamped.start - region.start) > 0.001 ||
      Math.abs(clamped.end - region.end) > 0.001
    ) {
      region.setOptions(clamped);
    }
    return clamped;
  };

  const onRegionBoundsChange = (region: RegionBounds) => {
    if (refs.toolRef.current !== "navigate") return;
    if (!refs.segmentRef.current.some((s) => s.id === region.id)) return;
    const clamped = applyRegionBounds(region, region.start, region.end);
    void refs.onBoundaryRef.current(region.id, clamped.start, clamped.end);
  };

  const onRegionBoundsLive = (region: RegionBounds) => {
    if (refs.toolRef.current !== "navigate") return;
    if (!refs.segmentRef.current.some((s) => s.id === region.id)) return;
    applyRegionBounds(region, region.start, region.end);
  };

  const onVideoPlay = () => {
    if (instance.isPlaying()) {
      syncPlaying();
      return;
    }
    void instance.play();
  };
  const onVideoPause = () => {
    if (instance.isPlaying()) instance.pause();
    syncPlaying();
  };
  const onVideoSeeked = () => {
    if (!session.isVideo || instance.isPlaying()) return;
    const time = session.video.currentTime;
    if (Math.abs(instance.getCurrentTime() - time) > 0.05)
      instance.setTime(time);
  };

  if (session.isVideo) {
    session.video.controls = false;
    session.video.addEventListener("play", onVideoPlay);
    session.video.addEventListener("pause", onVideoPause);
    session.video.addEventListener("seeked", onVideoSeeked);
  }

  return [
    instance.on("loading", (value) => setters.setLoading(value)),
    instance.on("ready", (value) => {
      setters.setError("");
      setters.setDuration(value);
      setters.setReady(true);
      setters.setLoading(100);
      setters.setLoadingStage("");
      refs.paintCurrentTime(instance.getCurrentTime());
    }),
    instance.on("error", (value) =>
      setters.setError(value instanceof Error ? value.message : String(value)),
    ),
    instance.on("timeupdate", (value) => {
      refs.paintCurrentTime(value);
      syncVideo(value);
      if (refs.followRef.current && instance.isPlaying()) {
        instance.setScrollTime(value);
      }
      const pad = refs.paddingRef.current;
      const loopOn = refs.loopRef.current;
      const active = refs.activeIdRef.current;
      if (refs.stopAt.current !== null && value >= refs.stopAt.current) {
        instance.pause();
        if (loopOn && active) {
          const segment = refs.segmentRef.current.find((s) => s.id === active);
          if (segment) {
            instance.setTime(Math.max(0, segment.start - pad));
            void instance.play();
            refs.stopAt.current = Math.min(
              instance.getDuration(),
              segment.end + pad,
            );
          }
        } else {
          refs.stopAt.current = null;
        }
      }
    }),
    instance.on("play", () => {
      if (session.isVideo) {
        const time = instance.getCurrentTime();
        try {
          session.video.currentTime = time;
        } catch {
          /* ignore seek errors during buffer */
        }
        void session.video.play().catch(() => {});
      }
      syncPlaying();
    }),
    instance.on("pause", () => {
      if (session.isVideo) session.video.pause();
      syncPlaying();
    }),
    instance.on("finish", () => {
      if (session.isVideo) session.video.pause();
      syncPlaying();
    }),
    instance.on("interaction", (value) => {
      const mode = refs.toolRef.current;
      if (mode === "navigate") {
        const hit = refs.segmentRef.current.find(
          (segment) => value >= segment.start && value <= segment.end,
        );
        if (hit) refs.onSelectRef.current(hit.id);
        return;
      }
    }),
    instance.on("click", (relativeX) => {
      if (refs.toolRef.current !== "navigate") return;
      const time = relativeX * instance.getDuration();
      const hit = refs.segmentRef.current.find(
        (segment) => time >= segment.start && time <= segment.end,
      );
      if (hit) refs.onSelectRef.current(hit.id);
    }),
    regionPlugin.on("region-clicked", (region, event) => {
      event.stopPropagation();
      if (refs.toolRef.current !== "navigate") return;
      if (region.id.startsWith("comment:")) {
        instance.setTime(region.start);
        return;
      }
      if (region.id.startsWith("__")) return;
      refs.onSelectRef.current(region.id);
    }),
    regionPlugin.on("region-updated", (region) => {
      onRegionBoundsChange(region as RegionBounds);
    }),
    regionPlugin.on("region-update", (region) => {
      onRegionBoundsLive(region as RegionBounds);
    }),
    regionPlugin.on("region-created", (region) => {
      const bounds = region as RegionBounds;
      if (
        refs.toolRef.current === "navigate" &&
        !region.id.includes(":") &&
        !region.id.startsWith("__") &&
        !refs.segmentRef.current.some((s) => s.id === bounds.id)
      ) {
        const duration = instance.getDuration();
        const clamped = clampNewSegmentBounds(
          bounds.start,
          bounds.end,
          refs.segmentRef.current,
          duration,
        );
        bounds.remove();
        setters.setTool("navigate");
        if (!clamped) return;
        void refs.onCreateRef.current(clamped.start, clamped.end);
      }
    }),
    () => {
      if (session.isVideo) {
        session.video.removeEventListener("play", onVideoPlay);
        session.video.removeEventListener("pause", onVideoPause);
        session.video.removeEventListener("seeked", onVideoSeeked);
      }
    },
  ];
}

function adoptSession(
  session: NonNullable<ReturnType<typeof reuseWaveSession>>,
  refs: InitRefs,
  setters: InitSetters,
) {
  refs.wave.current = session.wave;
  refs.regions.current = session.regions;
  setters.setReady(true);
  setters.setIsVideo(session.isVideo);
  setters.setDuration(session.duration);
  setters.setLoading(100);
  setters.setLoadingStage("");
  refs.paintCurrentTime(session.wave!.getCurrentTime());
  const px = session.wave!.options.minPxPerSec ?? refs.zoomRef.current;
  refs.zoomRef.current = px;
  setters.setZoom(px);
  session.wave!.zoom(px);
  return attachWaveHandlers(
    session.wave!,
    session.regions!,
    session,
    refs,
    setters,
  );
}

export function useWaveformInit(
  mediaId: string,
  mediaName: string,
  refs: InitRefs,
  setters: InitSetters,
) {
  useEffect(() => {
    const node = refs.container.current;
    const mediaMount = refs.mediaMount.current;
    const videoPanel = refs.videoPanel.current;
    if (!node || !mediaMount || !videoPanel) return;

    clearOtherWaveSessions(mediaId);
    let cancelled = false;
    let off: Array<() => void> = [];

    const attachReady = (
      session: NonNullable<ReturnType<typeof reuseWaveSession>>,
    ) => {
      if (!refs.container.current || !refs.mediaMount.current || !refs.videoPanel.current)
        return;
      mountWaveNodes(session, {
        mediaMount: refs.mediaMount.current,
        videoPanel: refs.videoPanel.current,
        canvas: refs.container.current,
      });
      off = adoptSession(session, refs, setters);
    };

    const existing = reuseWaveSession(mediaId);
    if (existing) {
      attachReady(existing);
      return () => {
        cancelled = true;
        off.forEach((un) => un());
      };
    }

    const session = getWaveSession(mediaId);
    mountWaveNodes(session, { mediaMount, videoPanel, canvas: node });

    const afterInit = () => {
      if (cancelled) return;
      const ready = reuseWaveSession(mediaId);
      if (ready) attachReady(ready);
    };

    if (session.initPromise) {
      void session.initPromise.then(afterInit);
      return () => {
        cancelled = true;
        off.forEach((un) => un());
      };
    }

    if (session.ready && session.wave && session.regions) {
      attachReady(session);
      return () => {
        cancelled = true;
        off.forEach((un) => un());
      };
    }

    let lastPct = 0;
    setters.setError("");
    setters.setLoading(0);
    setters.setLoadingStage("Подключение");

    session.initPromise = prepareWaveformMedia(
      mediaId,
      mediaName,
      (stage, percent) => {
        if (cancelled) return;
        if (percent < 100 && percent - lastPct < 10) return;
        lastPct = percent;
        setters.setLoading(percent);
        setters.setLoadingStage(
          stage === "buffer" ? "Буферизация" : "Декодирование аудио",
        );
      },
    )
      .then((prepared) => {
        if (cancelled || !refs.container.current || !refs.mediaMount.current || !refs.videoPanel.current)
          return;
        if (session.wave && session.regions) return;

        const colors = readWaveColors();
        const parentWidth = node.clientWidth || 800;
        const fitZoom = fitZoomPxPerSec(parentWidth, prepared.duration);
        const playback = prepared.isVideo ? session.video : session.audio;

        refs.zoomRef.current = fitZoom;
        setters.setZoom((prev) =>
          Math.abs(prev - fitZoom) > 0.01 ? fitZoom : prev,
        );
        setters.setIsVideo(prepared.isVideo);
        setters.setDuration(prepared.duration);

        session.isVideo = prepared.isVideo;
        mountWaveNodes(session, {
          mediaMount: refs.mediaMount.current,
          videoPanel: refs.videoPanel.current,
          canvas: refs.container.current,
        });

        if (
          session.streamUrl !== prepared.streamUrl ||
          playback.src !== prepared.streamUrl
        ) {
          playback.removeAttribute("crossorigin");
          playback.src = prepared.streamUrl;
          playback.preload = "auto";
          playback.muted = false;
        }

        if (prepared.isVideo) {
          session.videoStreamUrl = prepared.streamUrl;
          session.video.controls = false;
          session.video.playsInline = true;
          session.video.muted = false;
          session.audio.removeAttribute("src");
          session.audio.load();
        } else {
          session.video.removeAttribute("src");
          session.video.load();
          session.videoStreamUrl = "";
        }

        const regionPlugin = Regions.create();
        const displayPeaks = mergeWavePeaks(prepared.peaks);
        const gecko = geckoWaveOptions(colors, fitZoom);
        const instance = WaveSurfer.create({
          container: session.canvasHost,
          media: playback,
          peaks: displayPeaks,
          duration: prepared.duration,
          backend: "MediaElement",
          cursorColor: colors.ink,
          cursorWidth: 1,
          autoCenter: true,
          autoScroll: true,
          dragToSeek: false,
          ...gecko,
          plugins: [
            regionPlugin,
            Timeline.create({
              height: 22,
              timeInterval: 1,
              primaryLabelInterval: 10,
              secondaryLabelInterval: 5,
              style: {
                fontSize: "9px",
                color: colors.muted,
                backgroundColor: "#f3f3f1",
                borderTop: "1px solid #d9dad5",
              },
            }),
            Hover.create({
              lineColor: colors.accent,
              lineWidth: 1,
              labelBackground: colors.ink,
              labelColor: "#fff",
              labelSize: "10px",
            }),
          ],
        });

        bindWaveSession(mediaId, instance, regionPlugin, {
          ready: true,
          isVideo: prepared.isVideo,
          duration: prepared.duration,
          streamUrl: prepared.streamUrl,
        });
      })
      .then(afterInit)
      .catch((err) => {
        session.initPromise = undefined;
        if (!cancelled)
          setters.setError(err instanceof Error ? err.message : String(err));
      });

    void session.initPromise;

    return () => {
      cancelled = true;
      off.forEach((un) => un());
    };
    // refs and setters are intentionally grouped into fresh wrapper objects by the caller.
    // Their members are stable refs or React state setters; depending on the wrappers would
    // tear down and recreate the WaveSurfer session on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaId, mediaName]);
}
