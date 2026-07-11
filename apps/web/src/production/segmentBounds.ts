import type { Segment } from "./types";

const MIN_LENGTH = 0.1;

/** Snap segment start/end so it cannot overlap neighbors on the timeline. */
export function clampSegmentBounds(
  segmentId: string,
  start: number,
  end: number,
  segments: Segment[],
  duration: number,
  minLength = MIN_LENGTH,
): { start: number; end: number } {
  const ordered = [...segments].sort((a, b) => a.start - b.start);
  const index = ordered.findIndex((segment) => segment.id === segmentId);
  if (index < 0) return { start, end };

  const prev = ordered[index - 1];
  const next = ordered[index + 1];
  const minStart = prev ? prev.end : 0;
  const maxEnd = next ? next.start : duration;

  let nextStart = start;
  let nextEnd = end;
  if (nextEnd - nextStart < minLength) {
    nextEnd = nextStart + minLength;
  }
  if (nextStart < minStart) {
    const shift = minStart - nextStart;
    nextStart += shift;
    nextEnd += shift;
  }
  if (nextEnd > maxEnd) {
    const shift = nextEnd - maxEnd;
    nextStart -= shift;
    nextEnd -= shift;
  }
  nextStart = Math.max(minStart, nextStart);
  nextEnd = Math.min(maxEnd, nextEnd);
  if (nextEnd - nextStart < minLength) {
    if (maxEnd - minStart >= minLength) {
      nextEnd = Math.min(maxEnd, nextStart + minLength);
      nextStart = Math.max(minStart, nextEnd - minLength);
    } else {
      nextStart = minStart;
      nextEnd = Math.min(maxEnd, minStart + minLength);
    }
  }
  return {
    start: Number(Math.max(0, nextStart).toFixed(2)),
    end: Number(Math.min(duration, nextEnd).toFixed(2)),
  };
}

/** Fit a new segment into a gap without overlapping existing segments. */
export function clampNewSegmentBounds(
  start: number,
  end: number,
  segments: Segment[],
  duration: number,
  minLength = MIN_LENGTH,
): { start: number; end: number } | null {
  const ordered = [...segments].sort((a, b) => a.start - b.start);
  let nextStart = Math.max(0, start);
  let nextEnd = Math.min(duration, end);
  if (nextEnd - nextStart < minLength) return null;

  for (const segment of ordered) {
    if (nextEnd <= segment.start || nextStart >= segment.end) continue;
    const leftRoom = segment.start - nextStart;
    const rightRoom = nextEnd - segment.end;
    if (leftRoom >= rightRoom && leftRoom >= minLength) {
      nextEnd = segment.start;
    } else if (rightRoom >= minLength) {
      nextStart = segment.end;
    } else {
      return null;
    }
    if (nextEnd - nextStart < minLength) return null;
  }
  return {
    start: Number(nextStart.toFixed(2)),
    end: Number(nextEnd.toFixed(2)),
  };
}
