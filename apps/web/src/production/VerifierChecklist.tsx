import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";

export const CHECKLIST_ITEMS: Array<{ id: string; label: string }> = [
  { id: "audio-match", label: "Текст соответствует аудио" },
  { id: "bounds", label: "Границы сегментов корректны" },
  { id: "missed-speech", label: "Проверено отсутствие пропущенной речи" },
  { id: "terms", label: "Термины и имена собственные корректны" },
  { id: "text-rules", label: "Соблюдены правила оформления текста" },
  { id: "crosstalk", label: "Кросстолки и наложения обработаны верно" },
  { id: "no-empty", label: "Нет пустых и ошибочных сегментов" },
  { id: "rework", label: "Замечания после возврата обработаны" },
];

function storageKey(taskId: string, userId: string) {
  return `purrscription:checklist:${taskId}:${userId}`;
}

function readState(taskId: string, userId: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(storageKey(taskId, userId));
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function useVerifierChecklist(taskId: string, userId: string) {
  const [state, setState] = useState<Record<string, boolean>>(() =>
    readState(taskId, userId),
  );

  useEffect(() => {
    setState(readState(taskId, userId));
  }, [taskId, userId]);

  const persist = useCallback(
    (next: Record<string, boolean>) => {
      setState(next);
      try {
        localStorage.setItem(storageKey(taskId, userId), JSON.stringify(next));
      } catch {
        /* storage may be unavailable; keep in-memory state */
      }
    },
    [taskId, userId],
  );

  const toggle = useCallback(
    (id: string) => persist({ ...state, [id]: !state[id] }),
    [persist, state],
  );

  const reset = useCallback(() => persist({}), [persist]);

  const checkedCount = CHECKLIST_ITEMS.filter((item) => state[item.id]).length;
  const allChecked = checkedCount === CHECKLIST_ITEMS.length;

  return { state, toggle, reset, checkedCount, allChecked };
}

export function VerifierChecklist({
  state,
  toggle,
  reset,
  checkedCount,
  editable,
}: {
  state: Record<string, boolean>;
  toggle: (id: string) => void;
  reset: () => void;
  checkedCount: number;
  editable: boolean;
}) {
  return (
    <div className="checklist">
      <div className="checklist-head">
        <strong>
          Чек-лист проверки · {checkedCount}/{CHECKLIST_ITEMS.length}
        </strong>
        <button
          type="button"
          className="checklist-reset"
          onClick={reset}
          disabled={!editable || checkedCount === 0}
        >
          Сбросить
        </button>
      </div>
      <ul className="checklist-items">
        {CHECKLIST_ITEMS.map((item) => {
          const checked = Boolean(state[item.id]);
          return (
            <li key={item.id}>
              <label className={checked ? "checked" : ""}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!editable}
                  onChange={() => toggle(item.id)}
                />
                <span className="checklist-box" aria-hidden>
                  {checked && <Check size={13} />}
                </span>
                <span>{item.label}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="checklist-note">
        Отметки сохраняются локально в браузере для этой задачи.
      </p>
    </div>
  );
}
