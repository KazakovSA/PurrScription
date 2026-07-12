import { getAccessToken, useAppStore } from "./store";
import type {
  ApiErrorPayload,
  AuthSession,
  Envelope,
  Role,
  User,
} from "./types";
export const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ||
  "/api";

const DEFAULT_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 600_000;

function requestTimeoutMs(options: RequestInit): number {
  return options.body instanceof FormData ? UPLOAD_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
}

function timeoutMessage(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds >= 60) {
    const minutes = Math.round(seconds / 60);
    return `Сервер не ответил за ${minutes} мин. Проверьте размер файла и соединение, затем повторите.`;
  }
  return `Сервер не ответил за ${seconds} сек. Повторите запрос.`;
}

function networkErrorMessage(): string {
  if (API_BASE.startsWith("http") && !API_BASE.includes("localhost")) {
    return "Не удалось связаться с сервером. Проверьте интернет и повторите.";
  }
  return "API недоступен. Запустите backend и повторите запрос.";
}

function localizeErrorMessage(message: string): string {
  const map: Record<string, string> = {
    "Registration requires admin authentication":
      "Регистрация закрыта. Попросите администратора создать учётную запись.",
    "Invalid email or password": "Неверный email или пароль",
    "Email already registered": "Этот email уже зарегистрирован",
    "Only admins can register users":
      "Создавать пользователей может только администратор",
    "Media file not found": "Медиафайл не найден. Повторите загрузку.",
    "Cannot upload media": "Нет прав на загрузку медиа",
  };
  return map[message] ?? message;
}

function readErrorMessage(
  body: ApiErrorPayload | Record<string, unknown> | null,
  status: number,
): string {
  if (body && typeof body === "object") {
    const envelope = body as ApiErrorPayload;
    if (envelope.error?.message) {
      return localizeErrorMessage(envelope.error.message);
    }
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((item) =>
          typeof item === "object" && item && "msg" in item
            ? String((item as { msg?: string }).msg || item)
            : String(item),
        )
        .join("; ");
    }
  }
  if ([500, 502, 503, 504].includes(status)) {
    return status === 502
      ? "Сервер временно недоступен. Подождите и обновите страницу."
      : `Ошибка сервера (HTTP ${status}). Повторите позже.`;
  }
  return `HTTP ${status}`;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}
async function apiOnce<T>(path: string, options: RequestInit): Promise<T> {
  const headers = new Headers(options.headers),
    token = getAccessToken();
  if (API_BASE.includes("ngrok-free.app"))
    headers.set("ngrok-skip-browser-warning", "purrscription");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const timeoutMs = requestTimeoutMs(options);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch {
    const timedOut = controller.signal.aborted && !options.signal?.aborted;
    throw new ApiError(
      0,
      timedOut ? "REQUEST_TIMEOUT" : "NETWORK_ERROR",
      timedOut ? timeoutMessage(timeoutMs) : networkErrorMessage(),
    );
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
  if (response.status === 204) return undefined as T;
  const body = (await response.json().catch(() => null)) as
    ApiErrorPayload | Record<string, unknown> | T | null;
  if (!response.ok) {
    const message = readErrorMessage(
      body as ApiErrorPayload | Record<string, unknown> | null,
      response.status,
    );
    if (response.status === 401) useAppStore.getState().clearSession();
    throw new ApiError(
      response.status,
      (body as ApiErrorPayload | null)?.error?.code || "REQUEST_FAILED",
      message,
      (body as ApiErrorPayload | null)?.error?.details,
    );
  }
  return body as T;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  // Only auto-retry safe (idempotent) reads. POST/PATCH/DELETE may have already
  // reached the server on a transient network error, so retrying could duplicate.
  const retriable = method === "GET" || method === "HEAD";
  const maxAttempts = retriable ? 3 : 1;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await apiOnce<T>(path, options);
    } catch (error) {
      lastError = error;
      const transient =
        error instanceof ApiError &&
        (error.code === "NETWORK_ERROR" || error.code === "REQUEST_TIMEOUT");
      if (!transient || attempt === maxAttempts || options.signal?.aborted)
        throw error;
      await sleep(500 * attempt);
    }
  }
  throw lastError;
}
export async function loginRequest(email: string, password: string) {
  return (
    await api<Envelope<AuthSession>>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    })
  ).data;
}
export async function registerRequest(payload: {
  email: string;
  name: string;
  password: string;
  role?: Role;
}) {
  return (
    await api<Envelope<User>>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    })
  ).data;
}
export async function updateProfileRequest(name: string) {
  return (
    await api<Envelope<User>>("/auth/me", {
      method: "PATCH",
      body: JSON.stringify({ name }),
    })
  ).data;
}
export const mediaUrl = (id: string) => `${API_BASE}/media/${id}`;
export const assetUrl = (path?: string | null) =>
  path?.startsWith("/") ? `${API_BASE}${path}` : path || "";
export async function downloadAuthenticated(path: string, filename: string) {
  const token = getAccessToken();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(API_BASE.includes("ngrok-free.app")
          ? { "ngrok-skip-browser-warning": "purrscription" }
          : {}),
      },
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "Не удалось скачать файл. Проверьте, что backend запущен.",
    );
  } finally {
    window.clearTimeout(timeout);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      ApiErrorPayload | Record<string, unknown> | null;
    throw new ApiError(
      response.status,
      (body as ApiErrorPayload | null)?.error?.code || "DOWNLOAD_FAILED",
      readErrorMessage(body, response.status),
    );
  }
  const href = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(href);
}
export function mediaPlayUrl(id: string) {
  const token = getAccessToken();
  return token
    ? `${mediaUrl(id)}?access_token=${encodeURIComponent(token)}`
    : mediaUrl(id);
}
export function mediaFetchParams(): RequestInit {
  const token = getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (API_BASE.includes("ngrok-free.app"))
    headers["ngrok-skip-browser-warning"] = "purrscription";
  return { headers };
}
const MIME_BY_EXT: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  m4v: "video/mp4",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
};
export const guessMediaMime = (name: string, header = "") => {
  const clean = header.split(";")[0].trim();
  if (clean && clean !== "application/octet-stream") return clean;
  const ext = name.split(".").pop()?.toLowerCase();
  return ext && MIME_BY_EXT[ext]
    ? MIME_BY_EXT[ext]
    : "application/octet-stream";
};
export const isVideoMedia = (mime: string, name: string) =>
  mime.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(name);
const waitMediaReady = (element: HTMLMediaElement) =>
  element.readyState >= 1 &&
  Number.isFinite(element.duration) &&
  element.duration > 0
    ? Promise.resolve(element.duration)
    : new Promise<number>((resolve, reject) => {
        const ok = () => {
          element.removeEventListener("loadedmetadata", ok);
          element.removeEventListener("error", err);
          Number.isFinite(element.duration) && element.duration > 0
            ? resolve(element.duration)
            : reject(new Error("Не удалось определить длительность медиа"));
        };
        const err = () => {
          element.removeEventListener("loadedmetadata", ok);
          element.removeEventListener("error", err);
          reject(element.error || new Error("Ошибка загрузки медиа"));
        };
        element.addEventListener("loadedmetadata", ok, { once: true });
        element.addEventListener("error", err, { once: true });
      });
const peaksFromBuffer = (buffer: AudioBuffer, maxPxPerSec = 500) => {
  const bucketCount = Math.min(
    1_000_000,
    Math.max(16_384, Math.ceil((buffer.duration * maxPxPerSec) / 2)),
  );
  const envelope = new Float32Array(bucketCount * 2);
  const channels = Array.from(
    { length: Math.min(2, buffer.numberOfChannels) },
    (_, channel) => buffer.getChannelData(channel),
  );
  const sourceLength = channels[0]?.length ?? 0;
  const step = sourceLength / bucketCount;

  for (let i = 0; i < bucketCount; i += 1) {
    const start = Math.floor(i * step);
    const end = Math.min(
      sourceLength,
      Math.max(start + 1, Math.ceil((i + 1) * step)),
    );
    let min = 0;
    let max = 0;
    for (const channel of channels) {
      for (let j = start; j < end; j += 1) {
        const value = channel[j];
        if (value < min) min = value;
        if (value > max) max = value;
      }
    }
    envelope[i * 2] = max;
    envelope[i * 2 + 1] = min;
  }
  return [envelope];
};
const decodeAudioPeaksFromBuffer = async (buffer: ArrayBuffer) => {
  const ctx = new AudioContext();
  try {
    const audio = await ctx.decodeAudioData(buffer.slice(0));
    return { peaks: peaksFromBuffer(audio), duration: audio.duration };
  } finally {
    void ctx.close();
  }
};
const loadMediaBlob = async (
  url: string,
  onProgress?: (percent: number) => void,
) => {
  const response = await fetch(url, mediaFetchParams());
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const total = Number(response.headers.get("content-length")) || 0;
  if (!response.body || !total) return response.blob();
  const reader = response.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(new Uint8Array(value).buffer as ArrayBuffer);
    received += value.byteLength;
    onProgress?.(Math.min(99, Math.round((received / total) * 100)));
  }
  return new Blob(chunks, {
    type: response.headers.get("content-type") || "application/octet-stream",
  });
};
export const placeholderPeaks = (_duration: number, length = 16_384) => {
  // A flat line is honest when the browser cannot decode the audio track. A generated
  // pseudo-waveform looks like real signal and makes boundary editing misleading.
  return [new Float32Array(length)];
};
export type PreparedWaveformMedia = {
  duration: number;
  peaks: Array<Float32Array | number[]>;
  isVideo: boolean;
  streamUrl: string;
};
export async function prepareWaveformMedia(
  mediaId: string,
  mediaName: string,
  onProgress?: (stage: "buffer" | "decode", percent: number) => void,
) {
  const authenticatedUrl = mediaPlayUrl(mediaId),
    mime = guessMediaMime(mediaName),
    videoFile = isVideoMedia(mime, mediaName);
  onProgress?.("buffer", 5);
  // A media element cannot attach Authorization or tunnel headers. Fetch once with
  // credentials, then let video/audio and WaveSurfer share the same local Blob URL.
  const blob = await loadMediaBlob(authenticatedUrl, (percent) =>
    onProgress?.("buffer", percent),
  );
  const streamUrl = URL.createObjectURL(blob);
  onProgress?.("buffer", 90);
  const probe = document.createElement(videoFile ? "video" : "audio");
  probe.preload = "metadata";
  probe.src = streamUrl;
  let duration: number;
  try {
    duration = await waitMediaReady(probe);
  } catch (error) {
    URL.revokeObjectURL(streamUrl);
    throw error;
  } finally {
    probe.removeAttribute("src");
    probe.load();
  }
  onProgress?.("buffer", 100);
  let peaks = placeholderPeaks(duration);
  onProgress?.("decode", 0);
  try {
    const decoded = await decodeAudioPeaksFromBuffer(await blob.arrayBuffer());
    peaks = decoded.peaks;
    onProgress?.("decode", 100);
  } catch {
    onProgress?.("decode", 100);
  }
  return { duration, peaks, isVideo: videoFile, streamUrl };
}
