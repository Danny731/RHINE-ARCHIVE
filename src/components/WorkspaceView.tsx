import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent,
} from "react";
import { MoreHorizontal, Plus, X } from "lucide-react";
import type { Book } from "../model";
import type { ReaderTab, Workspace } from "../workspace";
import "../workspace.css";
import { primaryModifier } from "../platform";

export type WorkspaceAction =
  | { type: "select" | "close"; tabId: string }
  | { type: "move"; tabId: string; groupId: string; beforeId?: string }
  | {
      type: "split";
      tabId: string;
      orientation: Workspace["orientation"];
      duplicate?: boolean;
    }
  | { type: "merge" }
  | { type: "ratio"; ratio: number };
type DropTarget = {
  groupId: string;
  beforeId?: string;
  split?: Workspace["orientation"];
};
export default function WorkspaceView({
  workspace,
  books,
  onAction,
  onOpen,
  renderTab,
}: {
  workspace: Workspace;
  books: Book[];
  onAction: (action: WorkspaceAction) => void;
  onOpen: (groupId: string) => void;
  renderTab: (tab: ReaderTab, index: number) => ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    tabId: string;
    x: number;
    y: number;
    moved: boolean;
    target?: DropTarget;
  } | null>(null);
  const [preview, setPreview] = useState<DropTarget | null>(null);
  const suppressClick = useRef(false);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(
    null,
  );
  useEffect(() => {
    for (const bar of root.current?.querySelectorAll<HTMLElement>(
      ".workspace-tabs",
    ) || []) {
      const selected = bar.querySelector<HTMLElement>(
        ".workspace-tab.selected",
      );
      if (!selected) continue;
      const bounds = bar.getBoundingClientRect(),
        rect = selected.getBoundingClientRect();
      if (rect.left < bounds.left) bar.scrollLeft += rect.left - bounds.left;
      else if (rect.right > bounds.right)
        bar.scrollLeft += rect.right - bounds.right;
    }
  }, [workspace.groups.map((g) => g.activeTabId).join("|")]);
  useEffect(() => {
    if (!menu) return;
    const close = (event: Event) => {
      if (!(event.target as Element)?.closest(".workspace-menu")) setMenu(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [menu]);
  function targetAt(x: number, y: number): DropTarget | undefined {
    const element = document.elementFromPoint(x, y);
    const group = element?.closest<HTMLElement>("[data-reader-group]");
    if (!group || !root.current?.contains(group)) return;
    const groupId = group.dataset.readerGroup!;
    const tab = element?.closest<HTMLElement>("[data-workspace-tab]");
    if (tab) {
      const box = tab.getBoundingClientRect();
      const ids = workspace.groups.find((g) => g.id === groupId)!.tabs;
      const beforeId =
        x < box.left + box.width / 2
          ? tab.dataset.workspaceTab
          : ids[ids.indexOf(tab.dataset.workspaceTab!) + 1];
      return { groupId, beforeId };
    }
    const body = group
      .querySelector(".workspace-body")!
      .getBoundingClientRect();
    if (workspace.groups.length === 1 && y >= body.top) {
      if (y > body.top + body.height * 0.75)
        return { groupId, split: "vertical" };
      if (x > body.left + body.width * 0.7)
        return { groupId, split: "horizontal" };
    }
    return { groupId };
  }
  function dragMove(event: PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 7)
      drag.moved = true;
    if (!drag.moved) return;
    drag.target = targetAt(event.clientX, event.clientY);
    setPreview(drag.target || null);
  }
  function dragEnd() {
    const drag = dragRef.current;
    dragRef.current = null;
    setPreview(null);
    if (!drag?.moved) return;
    suppressClick.current = true;
    setTimeout(() => {
      suppressClick.current = false;
    }, 0);
    if (!drag.target) return;
    if (drag.target.split)
      onAction({
        type: "split",
        tabId: drag.tabId,
        orientation: drag.target.split,
      });
    else
      onAction({
        type: "move",
        tabId: drag.tabId,
        groupId: drag.target.groupId,
        beforeId: drag.target.beforeId,
      });
  }
  function resize(event: PointerEvent) {
    if (
      !event.currentTarget.hasPointerCapture(event.pointerId) ||
      !root.current
    )
      return;
    const box = root.current.getBoundingClientRect();
    const ratio =
      workspace.orientation === "horizontal"
        ? (event.clientX - box.left) / box.width
        : (event.clientY - box.top) / box.height;
    onAction({ type: "ratio", ratio: Math.min(0.8, Math.max(0.2, ratio)) });
  }
  const split = workspace.groups.length === 2;
  return (
    <div
      ref={root}
      className={`tab-workspace ${split ? `split-${workspace.orientation}` : ""}`}
      style={
        split
          ? workspace.orientation === "horizontal"
            ? {
                gridTemplateColumns: `minmax(0, ${workspace.ratio}fr) 7px minmax(0, ${1 - workspace.ratio}fr)`,
              }
            : {
                gridTemplateRows: `minmax(0, ${workspace.ratio}fr) 7px minmax(0, ${1 - workspace.ratio}fr)`,
              }
          : undefined
      }
    >
      {workspace.groups.map((group, index) => {
        const active = workspace.tabs.find((t) => t.id === group.activeTabId)!;
        return (
          <div
            className={`workspace-group ${workspace.activeGroupId === group.id ? "is-active" : ""}`}
            data-reader-group={group.id}
            key={group.id}
            style={{
              gridArea: split
                ? workspace.orientation === "horizontal"
                  ? `1 / ${index * 2 + 1}`
                  : `${index * 2 + 1} / 1`
                : undefined,
            }}
          >
            <div className="workspace-tabbar">
              <div
                className="workspace-tabs"
                role="tablist"
                aria-label={`文档标签 ${index + 1}`}
              >
                {group.tabs.map((id) => {
                  const tab = workspace.tabs.find((t) => t.id === id)!,
                    book = books.find((b) => b.id === tab.bookId)!;
                  return (
                    <div
                      className={`workspace-tab ${id === group.activeTabId ? "selected" : ""} ${preview?.beforeId === id ? "drop-before" : ""}`}
                      key={id}
                      data-workspace-tab={id}
                    >
                      <button
                        role="tab"
                        aria-selected={id === group.activeTabId}
                        aria-label={book.title}
                        title={`${book.title}${tab.draft?.text ? " · 有笔记草稿" : ""}`}
                        aria-controls={`panel-${group.id}`}
                        onClick={() => {
                          if (!suppressClick.current)
                            onAction({ type: "select", tabId: id });
                        }}
                        onPointerDown={(event) => {
                          if (event.button !== 0) return;
                          event.currentTarget.setPointerCapture(
                            event.pointerId,
                          );
                          dragRef.current = {
                            tabId: id,
                            x: event.clientX,
                            y: event.clientY,
                            moved: false,
                          };
                        }}
                        onPointerMove={dragMove}
                        onPointerUp={dragEnd}
                        onPointerCancel={() => {
                          dragRef.current = null;
                          setPreview(null);
                        }}
                        onKeyDown={(event) => {
                          if (
                            primaryModifier(event) &&
                            event.shiftKey &&
                            ["ArrowLeft", "ArrowRight"].includes(event.key)
                          ) {
                            event.preventDefault();
                            const at = group.tabs.indexOf(id),
                              delta = event.key === "ArrowLeft" ? -1 : 1;
                            if (
                              at + delta < 0 ||
                              at + delta >= group.tabs.length
                            )
                              return;
                            onAction({
                              type: "move",
                              tabId: id,
                              groupId: group.id,
                              beforeId: group.tabs[at + (delta < 0 ? -1 : 2)],
                            });
                          }
                        }}
                      >
                        {book.title}
                        {tab.draft?.text && <span aria-label="有草稿"> •</span>}
                      </button>
                      <button
                        className="tab-icon"
                        aria-label={`标签菜单：${book.title}`}
                        onClick={(event) => {
                          const box =
                            event.currentTarget.getBoundingClientRect();
                          setMenu({
                            id,
                            x: Math.max(
                              8,
                              Math.min(box.left, window.innerWidth - 225),
                            ),
                            y: Math.max(
                              8,
                              Math.min(box.bottom, window.innerHeight - 245),
                            ),
                          });
                        }}
                      >
                        <MoreHorizontal size={14} />
                      </button>
                      <button
                        className="tab-icon"
                        aria-label={`关闭标签：${book.title}`}
                        onClick={() => onAction({ type: "close", tabId: id })}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
              <button
                className="tab-icon"
                title="打开 PDF 到此阅读区"
                aria-label={`打开 PDF 到阅读区 ${index + 1}`}
                onClick={() => onOpen(group.id)}
              >
                <Plus size={17} />
              </button>
            </div>
            <div
              className="workspace-body"
              role="tabpanel"
              id={`panel-${group.id}`}
              aria-label={`阅读区 ${index + 1} 内容`}
            >
              {renderTab(active, index)}
              {preview?.groupId === group.id && (
                <div
                  className={`workspace-drop-preview ${preview.split || "move"}`}
                  aria-live="polite"
                >
                  {preview.split === "horizontal"
                    ? "松开后在右侧分屏"
                    : preview.split === "vertical"
                      ? "松开后在下方分屏"
                      : "移到此阅读区"}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {split && (
        <div
          className="workspace-resizer"
          role="separator"
          tabIndex={0}
          aria-label="调整分屏比例"
          aria-orientation={
            workspace.orientation === "horizontal" ? "vertical" : "horizontal"
          }
          aria-valuenow={Math.round(workspace.ratio * 100)}
          aria-valuemin={20}
          aria-valuemax={80}
          style={{
            gridArea:
              workspace.orientation === "horizontal" ? "1 / 2" : "2 / 1",
          }}
          onPointerDown={(event) =>
            event.currentTarget.setPointerCapture(event.pointerId)
          }
          onPointerMove={resize}
          onKeyDown={(event) => {
            if (
              [
                "ArrowLeft",
                "ArrowRight",
                "ArrowUp",
                "ArrowDown",
                "Home",
              ].includes(event.key)
            ) {
              event.preventDefault();
              event.stopPropagation();
              onAction({
                type: "ratio",
                ratio:
                  event.key === "Home"
                    ? 0.5
                    : Math.max(
                        0.2,
                        Math.min(
                          0.8,
                          workspace.ratio +
                            (["ArrowLeft", "ArrowUp"].includes(event.key)
                              ? -0.05
                              : 0.05),
                        ),
                      ),
              });
            }
          }}
        />
      )}
      {menu && (
        <div
          className="workspace-menu"
          role="menu"
          aria-label="标签操作"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            role="menuitem"
            onClick={() => {
              onAction({
                type: "split",
                tabId: menu.id,
                orientation: "horizontal",
              });
              setMenu(null);
            }}
          >
            在右侧分屏
          </button>
          <button
            role="menuitem"
            onClick={() => {
              onAction({
                type: "split",
                tabId: menu.id,
                orientation: "vertical",
              });
              setMenu(null);
            }}
          >
            在下方分屏
          </button>
          <button
            role="menuitem"
            onClick={() => {
              onAction({
                type: "split",
                tabId: menu.id,
                orientation: workspace.orientation,
                duplicate: true,
              });
              setMenu(null);
            }}
          >
            在另一侧对照同一 PDF
          </button>
          {split && (
            <button
              role="menuitem"
              onClick={() => {
                onAction({ type: "merge" });
                setMenu(null);
              }}
            >
              合并阅读区
            </button>
          )}
          <button
            role="menuitem"
            onClick={() => {
              onAction({ type: "close", tabId: menu.id });
              setMenu(null);
            }}
          >
            关闭标签
          </button>
        </div>
      )}
    </div>
  );
}
