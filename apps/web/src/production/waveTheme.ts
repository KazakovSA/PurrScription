export type WaveColors = {
  wave: string;
  progress: string;
  minimap: string;
  overlay: string;
  accent: string;
  ink: string;
  muted: string;
};

const pick = (style: CSSStyleDeclaration, name: string, fallback: string) =>
  style.getPropertyValue(name).trim() || fallback;

export function readWaveColors(): WaveColors {
  const style = getComputedStyle(document.documentElement);
  return {
    wave: pick(style, "--wave-base", "#2a2038"),
    progress: pick(style, "--wave-progress", "#1a1224"),
    minimap: pick(style, "--wave-minimap", "#c8cac5"),
    overlay: pick(style, "--wave-overlay", "rgba(210,116,50,.14)"),
    accent: pick(style, "--accent", "#c6682c"),
    ink: pick(style, "--ink", "#292a28"),
    muted: pick(style, "--muted", "#6b6d68"),
  };
}

export function fitZoomPxPerSec(containerWidth: number, duration: number) {
  const width = Math.max(320, containerWidth);
  const seconds = Math.max(duration, 1);
  return Math.max(10, Math.min(500, Math.round((width * 0.96) / seconds)));
}

/** Gecko: solid symmetric wave on tinted segment cells, real zoom (no stretch). */
export function geckoWaveOptions(colors: WaveColors, fitZoom: number) {
  return {
    height: 112,
    pixelRatio: 1,
    waveColor: colors.wave,
    progressColor: colors.progress,
    normalize: true,
    barWidth: 0,
    barGap: 0,
    barRadius: 0,
    minPxPerSec: fitZoom,
    fillParent: false,
    hideScrollbar: false,
  };
}

export function mergeWavePeaks(peaks: Array<Float32Array | number[]>) {
  if (peaks.length <= 1) return peaks;
  const len = Math.max(peaks[0]?.length ?? 0, peaks[1]?.length ?? 0);
  const merged: number[] = [];
  for (let i = 0; i < len; i += 1) {
    merged.push(Math.max(peaks[0]?.[i] ?? 0, peaks[1]?.[i] ?? 0));
  }
  return [merged];
}
