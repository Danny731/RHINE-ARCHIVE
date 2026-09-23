import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { FolderOpen, Moon, MoreHorizontal, Settings2, Sun } from "lucide-react";
import { primaryKey } from "../platform";

export default function ReaderMenu({
  dark,
  onOpen,
  onTheme,
  onSettings,
  onCover,
  onResetCover,
}: {
  dark: boolean;
  onOpen: () => void;
  onTheme: () => void;
  onSettings: () => void;
  onCover: () => void;
  onResetCover: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const lastOnOpen = useRef(false);
  const id = useId();
  const items = () => [
    ...(root.current?.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"]',
    ) || []),
  ];
  function close(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }
  useLayoutEffect(() => {
    if (open) {
      const options = items();
      options[lastOnOpen.current ? options.length - 1 : 0]?.focus();
      lastOnOpen.current = false;
    }
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", outside);
    };
  }, [open]);
  function select(action: () => void) {
    close(true);
    action();
  }
  return (
    <div
      className="reader-menu"
      ref={root}
      onKeyDown={(event) => {
        if (!open) return;
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close(true);
        }
        if (event.key === "Tab") close(true);
        if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
          event.preventDefault();
          event.stopPropagation();
        }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          event.stopPropagation();
          const options = items(),
            current = options.indexOf(
              document.activeElement as HTMLButtonElement,
            );
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? options.length - 1
                : (current +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    options.length) %
                  options.length;
          options[next]?.focus();
        }
      }}
    >
      <button
        className={`icon-button ${open ? "active" : ""}`}
        ref={trigger}
        title="应用菜单"
        aria-label="应用菜单"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (!open && ["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            event.stopPropagation();
            lastOnOpen.current = event.key === "ArrowUp";
            setOpen(true);
          }
        }}
      >
        <MoreHorizontal size={20} />
      </button>
      {open && (
        <div
          id={id}
          className="reader-menu-popover"
          role="menu"
          aria-label="应用操作"
        >
          <button
            role="menuitem"
            tabIndex={-1}
            title={`打开 PDF（${primaryKey} + O）`}
            onClick={() => select(onOpen)}
          >
            <FolderOpen size={16} />
            <span>打开 PDF</span>
            <kbd>{primaryKey} O</kbd>
          </button>
          <button
            role="menuitem"
            tabIndex={-1}
            title={dark ? "切换浅色界面" : "切换深色界面"}
            onClick={() => select(onTheme)}
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
            <span>{dark ? "切换浅色界面" : "切换深色界面"}</span>
          </button>
          <button role="menuitem" tabIndex={-1} onClick={() => select(onCover)}>
            将当前页设为封面
          </button>
          <button
            role="menuitem"
            tabIndex={-1}
            onClick={() => select(onResetCover)}
          >
            恢复默认封面
          </button>
          <button
            role="menuitem"
            tabIndex={-1}
            title="设置与备份"
            onClick={() => select(onSettings)}
          >
            <Settings2 size={16} />
            <span>设置与备份</span>
          </button>
        </div>
      )}
    </div>
  );
}
