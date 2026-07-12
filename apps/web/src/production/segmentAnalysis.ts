import type { Comment, Segment } from "./types";

export type IssueSeverity = "error" | "warning";

export interface SegmentIssue {
  key: string;
  segmentId: string | null;
  severity: IssueSeverity;
  category:
    | "empty"
    | "short"
    | "confidence"
    | "speaker"
    | "overlap"
    | "gap"
    | "suspicious";
  title: string;
  detail: string;
  time?: number;
}

const MIN_DURATION = 0.2;
const LOW_CONFIDENCE = 0.6;
const GAP_THRESHOLD = 1.5;

/** Heuristic patterns that usually mean the transcript still needs work. */
const SUSPICIOUS_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\?{2,}/, label: "знаки ??? — вероятно неразобранная речь" },
  { re: /\bx{3,}\b/i, label: "заглушка XXX" },
  { re: /\b(todo|fixme|тбд|заглушка|placeholder)\b/i, label: "служебная пометка" },
  {
    re: /\b(inaudible|unclear|неразборчиво|нрзб|неразборчива)\b/i,
    label: "пометка неразборчивости",
  },
  { re: /(.)\1{5,}/, label: "подозрительный повтор символа" },
];

function label(index: number) {
  return `Сегмент ${String(index + 1).padStart(2, "0")}`;
}

/**
 * Pure client-side transcript review. Produces a prioritised list of concrete
 * problems (empty text, overlaps, gaps that may hide missed speech, low
 * confidence, suspicious placeholders, missing speaker) that the AI assistant
 * panel renders and the pre-submit gate consumes.
 */
export function analyzeSegments(
  segments: Segment[],
  duration = 0,
): SegmentIssue[] {
  const ordered = [...segments].sort((a, b) => a.start - b.start);
  const issues: SegmentIssue[] = [];

  ordered.forEach((seg, i) => {
    const name = label(i);
    if (!seg.text.trim()) {
      issues.push({
        key: `empty-${seg.id}`,
        segmentId: seg.id,
        severity: "error",
        category: "empty",
        title: `${name}: пустой текст`,
        detail: "Заполните расшифровку или удалите пустой сегмент.",
        time: seg.start,
      });
    }
    if (seg.end - seg.start < MIN_DURATION) {
      issues.push({
        key: `short-${seg.id}`,
        segmentId: seg.id,
        severity: "warning",
        category: "short",
        title: `${name}: очень короткий (${(seg.end - seg.start).toFixed(2)} с)`,
        detail: "Проверьте границы — сегмент подозрительно короткий.",
        time: seg.start,
      });
    }
    if (seg.text.trim() && seg.confidence > 0 && seg.confidence < LOW_CONFIDENCE) {
      issues.push({
        key: `conf-${seg.id}`,
        segmentId: seg.id,
        severity: "warning",
        category: "confidence",
        title: `${name}: низкая уверенность ${Math.round(seg.confidence * 100)}%`,
        detail: "Прослушайте и сверьте текст с аудио.",
        time: seg.start,
      });
    }
    if (!seg.speaker) {
      issues.push({
        key: `spk-${seg.id}`,
        segmentId: seg.id,
        severity: "warning",
        category: "speaker",
        title: `${name}: не указан спикер`,
        detail: "Назначьте спикера или спец-метку ([CROSSTALK], [MUSIC]…).",
        time: seg.start,
      });
    }
    for (const pattern of SUSPICIOUS_PATTERNS) {
      if (pattern.re.test(seg.text)) {
        issues.push({
          key: `susp-${seg.id}-${pattern.label}`,
          segmentId: seg.id,
          severity: "warning",
          category: "suspicious",
          title: `${name}: ${pattern.label}`,
          detail: "Похоже на незавершённую расшифровку — проверьте термин.",
          time: seg.start,
        });
        break;
      }
    }
    const next = ordered[i + 1];
    if (next) {
      if (seg.end > next.start + 0.001) {
        issues.push({
          key: `overlap-${seg.id}`,
          segmentId: seg.id,
          severity: "error",
          category: "overlap",
          title: `${name}: пересекается со следующим`,
          detail: `Конец ${seg.end.toFixed(2)} с заходит за начало соседа ${next.start.toFixed(2)} с.`,
          time: next.start,
        });
      } else if (next.start - seg.end > GAP_THRESHOLD) {
        issues.push({
          key: `gap-${seg.id}`,
          segmentId: seg.id,
          severity: "warning",
          category: "gap",
          title: `${name}: пауза ${(next.start - seg.end).toFixed(1)} с до следующего`,
          detail: "Проверьте, нет ли пропущенной речи в этом промежутке.",
          time: seg.end,
        });
      }
    }
  });

  if (ordered.length) {
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    if (first.start > GAP_THRESHOLD) {
      issues.push({
        key: "gap-lead",
        segmentId: first.id,
        severity: "warning",
        category: "gap",
        title: `Пауза ${first.start.toFixed(1)} с в начале записи`,
        detail: "Проверьте, нет ли речи до первого сегмента.",
        time: 0,
      });
    }
    if (duration > 0 && duration - last.end > GAP_THRESHOLD) {
      issues.push({
        key: "gap-tail",
        segmentId: last.id,
        severity: "warning",
        category: "gap",
        title: `Пауза ${(duration - last.end).toFixed(1)} с в конце записи`,
        detail: "Проверьте, нет ли речи после последнего сегмента.",
        time: last.end,
      });
    }
  }

  const rank: Record<IssueSeverity, number> = { error: 0, warning: 1 };
  return issues.sort(
    (a, b) => rank[a.severity] - rank[b.severity] || (a.time ?? 0) - (b.time ?? 0),
  );
}

export interface ReadinessInput {
  segments: Segment[];
  duration: number;
  comments: Comment[];
  checklistComplete: boolean;
  listenedRatio: number;
  hasUnsaved: boolean;
}

export interface ReadinessCheck {
  key: string;
  ok: boolean;
  blocking: boolean;
  label: string;
}

const LISTENED_TARGET = 0.95;

/**
 * The automatic pre-submit / pre-accept gate. Blocking checks must all pass
 * before a task can be sent to review or accepted; warnings are surfaced but do
 * not block.
 */
export function submitReadiness(input: ReadinessInput): ReadinessCheck[] {
  const issues = analyzeSegments(input.segments, input.duration);
  const emptyText = issues.filter((i) => i.category === "empty").length;
  const overlaps = issues.filter((i) => i.category === "overlap").length;
  const suspicious = issues.filter((i) => i.category === "suspicious").length;
  const unresolved = input.comments.filter((c) => !c.resolved).length;

  return [
    {
      key: "unsaved",
      ok: !input.hasUnsaved,
      blocking: true,
      label: input.hasUnsaved
        ? "Есть несохранённые изменения сегмента"
        : "Все изменения сохранены",
    },
    {
      key: "empty",
      ok: emptyText === 0,
      blocking: true,
      label:
        emptyText === 0
          ? "Нет пустых сегментов без текста"
          : `Пустые сегменты без текста: ${emptyText}`,
    },
    {
      key: "overlap",
      ok: overlaps === 0,
      blocking: true,
      label:
        overlaps === 0
          ? "Нет пересекающихся сегментов"
          : `Пересекающиеся сегменты: ${overlaps}`,
    },
    {
      key: "comments",
      ok: unresolved === 0,
      blocking: true,
      label:
        unresolved === 0
          ? "Все замечания закрыты"
          : `Незакрытые замечания: ${unresolved}`,
    },
    {
      key: "checklist",
      ok: input.checklistComplete,
      blocking: true,
      label: input.checklistComplete
        ? "Чек-лист проверки отмечен"
        : "Чек-лист проверки не отмечен полностью",
    },
    {
      key: "listened",
      ok: input.listenedRatio >= LISTENED_TARGET,
      blocking: true,
      label:
        input.listenedRatio >= LISTENED_TARGET
          ? "Запись прослушана до конца"
          : `Запись прослушана на ${Math.round(input.listenedRatio * 100)}% (нужно ≥ ${Math.round(LISTENED_TARGET * 100)}%)`,
    },
    {
      key: "suspicious",
      ok: suspicious === 0,
      blocking: false,
      label:
        suspicious === 0
          ? "Подозрительных терминов не найдено"
          : `Подозрительные термины: ${suspicious} (проверьте)`,
    },
  ];
}
