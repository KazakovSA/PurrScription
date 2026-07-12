import { useEffect, useState } from "react";
import { Keyboard, X } from "lucide-react";

export const HOTKEYS: Array<{ keys: string[]; action: string }> = [
  { keys: ["Space"], action: "Воспроизведение / пауза" },
  { keys: ["Shift", "Space"], action: "Проиграть текущий сегмент" },
  { keys: ["J"], action: "Назад на 1 с (Shift — на 0,1 с)" },
  { keys: ["L"], action: "Вперёд на 1 с (Shift — на 0,1 с)" },
  { keys: ["Esc"], action: "Остановить / сбросить инструмент" },
  { keys: ["?"], action: "Показать / скрыть эту подсказку" },
];

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return Boolean(
    el?.matches?.('input,textarea,select,[contenteditable="true"]'),
  );
}

export function HotkeysOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) {
        setOpen(false);
        return;
      }
      if (isTypingTarget(event.target)) return;
      if (event.key === "?" || (event.key === "/" && event.shiftKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="hotkeys-fab"
        title="Горячие клавиши (?)"
        aria-label="Показать горячие клавиши"
        onClick={() => setOpen((value) => !value)}
      >
        <Keyboard size={16} />
      </button>
      {open && (
        <div
          className="hotkeys-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Горячие клавиши"
          onClick={() => setOpen(false)}
        >
          <div className="hotkeys-card" onClick={(e) => e.stopPropagation()}>
            <header>
              <h3>
                <Keyboard size={18} /> Горячие клавиши
              </h3>
              <button
                type="button"
                aria-label="Закрыть"
                onClick={() => setOpen(false)}
              >
                <X size={16} />
              </button>
            </header>
            <ul>
              {HOTKEYS.map((row) => (
                <li key={row.action}>
                  <span className="hotkeys-combo">
                    {row.keys.map((key) => (
                      <kbd key={key}>{key}</kbd>
                    ))}
                  </span>
                  <span>{row.action}</span>
                </li>
              ))}
            </ul>
            <footer>Нажмите «?» в любой момент, чтобы открыть эту панель.</footer>
          </div>
        </div>
      )}
    </>
  );
}
