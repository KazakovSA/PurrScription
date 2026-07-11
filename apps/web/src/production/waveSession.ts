import type WaveSurfer from "wavesurfer.js";
import type Regions from "wavesurfer.js/dist/plugins/regions.esm.js";

export type WaveSession = {
  mediaId: string;
  audio: HTMLAudioElement;
  video: HTMLVideoElement;
  canvasHost: HTMLDivElement;
  wave: WaveSurfer | null;
  regions: Regions | null;
  ready: boolean;
  isVideo: boolean;
  duration: number;
  streamUrl: string;
  videoStreamUrl: string;
  blobUrl: string;
  engineVersion: number;
  initPromise?: Promise<void>;
};

export const WAVE_ENGINE_VERSION = 15;

declare global {
  interface Window {
    __purrWaveSessions?: Map<string, WaveSession>;
  }
}

function sessionMap() {
  if (!window.__purrWaveSessions) {
    window.__purrWaveSessions = new Map();
  }
  return window.__purrWaveSessions;
}

export function peekWaveSession(mediaId: string) {
  return sessionMap().get(mediaId) ?? null;
}

export function getWaveSession(mediaId: string): WaveSession {
  const sessions = sessionMap();
  const cached = sessions.get(mediaId);
  if (cached) return cached;

  const shell: WaveSession = {
    mediaId,
    audio: document.createElement("audio"),
    video: document.createElement("video"),
    canvasHost: document.createElement("div"),
    wave: null,
    regions: null,
    ready: false,
    isVideo: false,
    duration: 0,
    streamUrl: "",
    videoStreamUrl: "",
    blobUrl: "",
    engineVersion: WAVE_ENGINE_VERSION,
  };

  shell.audio.className = "playback-audio";
  shell.audio.preload = "auto";
  shell.video.className = "workspace-video";
  shell.video.playsInline = true;
  shell.video.preload = "auto";
  shell.canvasHost.className = "waveform-canvas-host";

  sessions.set(mediaId, shell);
  return shell;
}

export function mountWaveNodes(
  session: WaveSession,
  targets: {
    mediaMount: HTMLElement;
    videoPanel: HTMLElement;
    canvas: HTMLElement;
  },
) {
  if (session.isVideo) {
    if (session.video.parentElement !== targets.videoPanel) {
      targets.videoPanel.replaceChildren(session.video);
    }
  } else if (session.audio.parentElement !== targets.mediaMount) {
    targets.mediaMount.replaceChildren(session.audio);
  }

  if (session.canvasHost.parentElement !== targets.canvas) {
    targets.canvas.replaceChildren(session.canvasHost);
  }
}

export function setSessionBlobUrl(session: WaveSession, blobUrl: string) {
  if (session.blobUrl && session.blobUrl !== blobUrl) {
    URL.revokeObjectURL(session.blobUrl);
  }
  session.blobUrl = blobUrl;
}

export function revokeSessionBlob(session: WaveSession) {
  if (!session.blobUrl) return;
  URL.revokeObjectURL(session.blobUrl);
  session.blobUrl = "";
}

export function bindWaveSession(
  mediaId: string,
  wave: WaveSurfer,
  regions: Regions,
  meta: Pick<WaveSession, "ready" | "isVideo" | "duration" | "streamUrl">,
) {
  const session = getWaveSession(mediaId);
  session.wave = wave;
  session.regions = regions;
  session.ready = meta.ready;
  session.isVideo = meta.isVideo;
  session.duration = meta.duration;
  session.streamUrl = meta.streamUrl;
  session.engineVersion = WAVE_ENGINE_VERSION;
}

export function reuseWaveSession(mediaId: string) {
  const session = sessionMap().get(mediaId);
  if (!session?.ready || !session.wave || !session.regions) return null;
  if (session.engineVersion !== WAVE_ENGINE_VERSION) {
    destroyWaveSession(mediaId);
    return null;
  }
  return session;
}

export function destroyWaveSession(mediaId: string) {
  const sessions = sessionMap();
  const session = sessions.get(mediaId);
  if (!session) return;
  revokeSessionBlob(session);
  session.wave?.destroy();
  session.audio.remove();
  session.video.remove();
  session.canvasHost.remove();
  sessions.delete(mediaId);
}

export function clearOtherWaveSessions(keepMediaId: string) {
  for (const id of [...sessionMap().keys()]) {
    if (id !== keepMediaId) destroyWaveSession(id);
  }
}
