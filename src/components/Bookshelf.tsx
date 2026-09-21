import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, BookOpen, FolderPlus, Search, X } from "lucide-react";
import type { Book, Library } from "../model";
import {
  assignBook,
  deleteCollection,
  nameCollection,
  removeFromShelf,
  restoreToShelf,
  setCollectionBooks,
} from "../shelf";
import "../shelf.css";
import { BRAND_NAME } from "../branding";
import ArchiveCover from "./ArchiveCover";

function ShelfDialog({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current!;
    node.showModal();
    return () => node.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="shelf-dialog"
      aria-label={title}
      onCancel={close}
      onClose={close}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="关闭对话框" onClick={close}>
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
type Dialog =
  | { kind: "create" | "rename"; id: string }
  | { kind: "delete"; id: string }
  | { kind: "assign" | "remove"; bookId: string }
  | { kind: "members"; id: string };

export default function Bookshelf({
  library,
  onChange,
  onOpen,
  onChooseFile,
  disabled,
  view,
  onViewChange,
  saveStatus,
  onDemo,
}: {
  library: Library;
  onChange: (change: (library: Library) => Library) => void;
  onOpen: (book: Book) => void;
  onChooseFile: (collectionId?: string) => void;
  disabled: boolean;
  view: string;
  onViewChange: (view: string) => void;
  saveStatus: "saving" | "saved" | "error";
  onDemo: () => void;
}) {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState("recent");
  const [display, setDisplay] = useState<"cards" | "list">("cards");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{
    text: string;
    undoId?: string;
  } | null>(null);
  const collections = library.collections || [];
  const active = library.books.filter((b) => b.removedAt === undefined);
  const removed = library.books.filter((b) => b.removedAt !== undefined);
  const activeIds = new Set(active.map((b) => b.id));
  const collection = collections.find((c) => `collection:${c.id}` === view);
  const actualView =
    view.startsWith("collection:") && !collection ? "all" : view;
  const classified = new Set(collections.flatMap((c) => c.bookIds));
  const members =
    actualView === "removed"
      ? removed
      : collection
        ? active.filter((b) => collection.bookIds.includes(b.id))
        : actualView === "unfiled"
          ? active.filter((b) => !classified.has(b.id))
          : active;
  const books = members
    .filter((b) =>
      b.title.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()),
    )
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title, "zh-CN")
        : actualView === "removed"
          ? b.removedAt! - a.removedAt!
          : b.opened - a.opened,
    );
  const selectedBook =
    dialog && "bookId" in dialog
      ? library.books.find((b) => b.id === dialog.bookId)
      : undefined;
  const selectedCollection =
    dialog && "id" in dialog
      ? collections.find((c) => c.id === dialog.id)
      : undefined;
  const close = () => {
    setDialog(null);
    setError("");
  };
  const switchView = (next: string) => {
    onViewChange(next);
    setFilter("");
  };
  function openDialog(next: Dialog) {
    setError("");
    setDialog(next);
    setName(
      "id" in next ? collections.find((c) => c.id === next.id)?.name || "" : "",
    );
    setSelected(
      next.kind === "assign"
        ? collections
            .filter((c) => c.bookIds.includes(next.bookId))
            .map((c) => c.id)
        : next.kind === "members"
          ? collections.find((c) => c.id === next.id)?.bookIds || []
          : [],
    );
  }
  function toggle(id: string) {
    setSelected((old) =>
      old.includes(id) ? old.filter((value) => value !== id) : [...old, id],
    );
  }
  function restore(id: string) {
    onChange((lib) => restoreToShelf(lib, id));
    setNotice({ text: "已恢复到书架，阅读资料和合集关系均已保留。" });
  }
  return (
    <section className="shelf" aria-label="书架管理">
      <aside className="archive-rail">
        <div className="rail-kicker">LOCAL DIRECTORY</div>
        <h2 className="rail-title">资料目录</h2>
        <nav className="collection-tabs" aria-label="书架分类">
          <button
            aria-pressed={actualView === "all"}
            onClick={() => switchView("all")}
          >
            全部书籍 <span>{active.length}</span>
          </button>
          <button
            aria-pressed={actualView === "unfiled"}
            onClick={() => switchView("unfiled")}
          >
            未分类{" "}
            <span>{active.filter((b) => !classified.has(b.id)).length}</span>
          </button>
          <div className="rail-section">COLLECTIONS / 合集</div>
          {collections.map((c, index) => (
            <button
              key={c.id}
              title={c.name}
              aria-pressed={collection?.id === c.id}
              onClick={() => switchView("collection:" + c.id)}
            >
              <i aria-hidden="true">{String(index + 1).padStart(2, "0")}</i>
              <b>{c.name}</b>{" "}
              <span>{c.bookIds.filter((id) => activeIds.has(id)).length}</span>
            </button>
          ))}
          <button
            className="rail-create"
            disabled={disabled}
            onClick={() =>
              openDialog({ kind: "create", id: crypto.randomUUID() })
            }
          >
            <FolderPlus size={14} />
            新建合集
          </button>
          <button
            className="rail-removed"
            aria-pressed={actualView === "removed"}
            onClick={() => switchView("removed")}
          >
            已移除 <span>{removed.length}</span>
          </button>
        </nav>
        <div className="rail-bottom">
          <div className="mini-mark" aria-hidden="true">
            R/A
          </div>
          <p className="rail-motto">
            <span>PER ASPERA</span>
            <br />
            <strong>AD ASTRA</strong>
          </p>
        </div>
      </aside>
      <div className="archive-main">
        <div className="section-title shelf-heading">
          <div>
            <span className="archive-eyebrow">YOUR KNOWLEDGE, ARCHIVED.</span>
            <h1>
              阅读档案 <small>ARCHIVE INDEX</small>
            </h1>
            <p>
              {active.length} 份资料 · 从上次停下的地方继续。
              <span
                className={
                  saveStatus === "error" ? "shelf-error" : "shelf-save-status"
                }
              >
                {saveStatus === "saving"
                  ? "正在保存…"
                  : saveStatus === "error"
                    ? "保存失败，请导出备份后重试。"
                    : "书架已保存"}
              </span>
            </p>
          </div>
          <button
            className="primary-button archive-import"
            disabled={disabled}
            onClick={() => onChooseFile(collection?.id)}
            aria-label="打开本地 PDF"
          >
            <span className="import-plus">＋</span>
            <span>
              导入 PDF<small>IMPORT DOCUMENT</small>
            </span>
            <ArrowUpRight size={19} />
          </button>
        </div>
        <div className="shelf-controls">
          <h3>
            {collection?.name ||
              (actualView === "removed"
                ? "已移除"
                : actualView === "unfiled"
                  ? "未分类"
                  : "全部书籍")}
          </h3>
          <div className="shelf-view-switch" aria-label="书架显示方式">
            <button
              aria-pressed={display === "cards"}
              onClick={() => setDisplay("cards")}
            >
              档案卡片
            </button>
            <button
              aria-pressed={display === "list"}
              onClick={() => setDisplay("list")}
            >
              列表
            </button>
          </div>
          <div className="shelf-search">
            <Search size={15} />
            <input
              aria-label="查找书籍"
              placeholder="查找书籍…"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
          </div>
          <select
            aria-label="书架排序"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="recent">
              {actualView === "removed" ? "最近移除" : "最近阅读"}
            </option>
            <option value="title">书名排序</option>
          </select>
          {collection && (
            <div className="collection-actions">
              <button
                className="text-button"
                disabled={disabled}
                onClick={() =>
                  openDialog({ kind: "members", id: collection.id })
                }
              >
                管理合集书籍
              </button>
              <button
                className="text-button"
                disabled={disabled}
                onClick={() => onChooseFile(collection.id)}
              >
                导入 PDF 到合集
              </button>
              <button
                className="text-button"
                disabled={disabled}
                onClick={() =>
                  openDialog({ kind: "rename", id: collection.id })
                }
              >
                重命名合集
              </button>
              <button
                className="text-button"
                disabled={disabled}
                onClick={() =>
                  openDialog({ kind: "delete", id: collection.id })
                }
              >
                删除合集
              </button>
            </div>
          )}
        </div>
        {actualView === "removed" && (
          <p className="shelf-help">
            原 PDF
            和阅读资料都已保留。恢复后可继续阅读，也可以直接打开书籍恢复。
          </p>
        )}
        {notice && (
          <div className="shelf-notice" role="status">
            <span>{notice.text}</span>
            {notice.undoId && (
              <button
                className="text-button"
                disabled={disabled}
                onClick={() => restore(notice.undoId!)}
              >
                撤销移除
              </button>
            )}
            <button
              className="icon-button"
              aria-label="关闭书架提示"
              onClick={() => setNotice(null)}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {books.length ? (
          <div className={`book-grid ${display === "list" ? "book-list" : ""}`}>
            {books.map((book, index) => (
              <article
                className={`shelf-book ${index === 0 && actualView !== "removed" && !filter ? "recent-book" : ""}`}
                key={book.id}
                aria-label={book.title}
              >
                <button className="book-card" onClick={() => onOpen(book)}>
                  <ArchiveCover
                    number={
                      library.books.findIndex((b) => b.id === book.id) + 1
                    }
                    variant={library.books.findIndex((b) => b.id === book.id)}
                  />
                  <div className="book-info">
                    <div className="archive-category">
                      {book.source === "demo"
                        ? "示例教材"
                        : collections.find((c) => c.bookIds.includes(book.id))
                            ?.name || "未分类"}
                      <span>PDF / {book.pages} PAGES</span>
                    </div>
                    <h3 title={book.title}>{book.title}</h3>
                    <div>
                      <span>读到第 {book.position.page} 页</span>
                      <span>
                        {Math.round((book.position.page / book.pages) * 100)}%
                      </span>
                    </div>
                    <div className="progress-track">
                      <i
                        style={{
                          width: `${(book.position.page / book.pages) * 100}%`,
                        }}
                      />
                    </div>
                    <p>
                      {book.marks.length} 条标注
                      <span>
                        {actualView === "removed" ? "恢复并阅读" : "继续阅读"}
                        <ArrowUpRight size={13} />
                      </span>
                    </p>
                  </div>
                </button>
                <div className="book-collections">
                  {collections
                    .filter((c) => c.bookIds.includes(book.id))
                    .map((c) => (
                      <button
                        key={c.id}
                        title={c.name}
                        onClick={() => switchView(`collection:${c.id}`)}
                      >
                        {c.name}
                      </button>
                    ))}
                </div>
                <div className="book-actions">
                  {actualView === "removed" ? (
                    <button
                      className="text-button"
                      disabled={disabled}
                      onClick={() => restore(book.id)}
                    >
                      恢复到书架
                    </button>
                  ) : (
                    <>
                      <button
                        className="text-button"
                        disabled={disabled}
                        onClick={() =>
                          openDialog({ kind: "assign", bookId: book.id })
                        }
                      >
                        加入 / 管理合集
                      </button>
                      {collection && (
                        <button
                          className="text-button"
                          disabled={disabled}
                          onClick={() => {
                            onChange((lib) =>
                              assignBook(
                                lib,
                                book.id,
                                (lib.collections || [])
                                  .filter(
                                    (c) =>
                                      c.id !== collection.id &&
                                      c.bookIds.includes(book.id),
                                  )
                                  .map((c) => c.id),
                              ),
                            );
                            setNotice({
                              text: `已移出“${collection.name}”，书籍仍在书架。`,
                            });
                          }}
                        >
                          移出合集
                        </button>
                      )}
                      <button
                        className="text-button"
                        disabled={disabled}
                        onClick={() =>
                          openDialog({ kind: "remove", bookId: book.id })
                        }
                      >
                        从书架移除
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-shelf">
            <span className="empty-icon">
              <BookOpen size={27} strokeWidth={1.3} />
            </span>
            <div>
              <h3>
                {filter
                  ? "没有找到这本书"
                  : collection
                    ? "这个合集还没有书"
                    : actualView === "removed"
                      ? "没有已移除的书籍"
                      : actualView === "unfiled"
                        ? "书籍都已分类"
                        : "你的下一本教材，从这里开始"}
              </h3>
              <p>
                {filter
                  ? "试试其他关键词。"
                  : collection
                    ? "添加书架中的教材，或导入本地 PDF。"
                    : actualView === "removed"
                      ? "从书架移除的书籍可以在这里恢复。"
                      : `打开一本 PDF，${BRAND_NAME}会为你记住阅读进度、书签与笔记。`}
              </p>
            </div>
            {!filter && actualView !== "removed" && (
              <button
                className="secondary-button"
                onClick={() => onChooseFile(collection?.id)}
              >
                选择文件 <ArrowUpRight size={15} />
              </button>
            )}
          </div>
        )}
        <div className="archive-catalog-footer">
          <span>
            {books.length} / {members.length} 份资料 <small>DOCUMENTS</small>
          </span>
          <button className="text-button" onClick={onDemo}>
            体验示例教材 <ArrowUpRight size={14} />
          </button>
        </div>
      </div>
      {dialog && (
        <ShelfDialog
          key={dialog.kind + ("id" in dialog ? dialog.id : dialog.bookId)}
          title={
            dialog.kind === "create"
              ? "新建合集"
              : dialog.kind === "rename"
                ? "重命名合集"
                : dialog.kind === "delete"
                  ? "删除合集"
                  : dialog.kind === "remove"
                    ? "从书架移除"
                    : dialog.kind === "members"
                      ? "管理合集书籍"
                      : "管理书籍合集"
          }
          close={close}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (disabled) return;
              if (dialog.kind === "create" || dialog.kind === "rename") {
                try {
                  nameCollection(library, dialog.id, name);
                } catch (err) {
                  setError((err as Error).message);
                  return;
                }
                onChange((lib) => nameCollection(lib, dialog.id, name));
                switchView(`collection:${dialog.id}`);
              } else if (dialog.kind === "delete") {
                onChange((lib) => deleteCollection(lib, dialog.id));
                switchView("all");
                setNotice({
                  text: "合集已删除，其中的 PDF 和阅读资料仍在书架。",
                });
              } else if (dialog.kind === "assign")
                onChange((lib) => assignBook(lib, dialog.bookId, selected));
              else if (dialog.kind === "members")
                onChange((lib) => setCollectionBooks(lib, dialog.id, selected));
              else if (dialog.kind === "remove") {
                onChange((lib) => removeFromShelf(lib, dialog.bookId));
                setNotice({
                  text: "已从书架移除，原 PDF 和阅读资料已保留。",
                  undoId: dialog.bookId,
                });
              }
              close();
            }}
          >
            {(dialog.kind === "create" || dialog.kind === "rename") && (
              <label className="collection-name">
                合集名称
                <input
                  autoFocus
                  value={name}
                  maxLength={60}
                  placeholder="例如：机器人学、考研数学"
                  onChange={(event) => {
                    setName(event.target.value);
                    setError("");
                  }}
                />
              </label>
            )}
            {dialog.kind === "delete" && (
              <p>
                删除“{selectedCollection?.name}”？只删除合集分类，其中的
                PDF、进度和笔记都会保留。
              </p>
            )}
            {dialog.kind === "remove" && (
              <p>
                将《{selectedBook?.title}》从书架移除？不会删除原
                PDF、进度、笔记或目录，可在“已移除”中恢复。
              </p>
            )}
            {dialog.kind === "assign" && (
              <>
                <p>为《{selectedBook?.title}》选择合集，可以多选。</p>
                {!collections.length && (
                  <p>还没有合集，请先关闭此窗口，在书架点击“新建合集”。</p>
                )}
                <div className="collection-checklist">
                  {collections.map((c) => (
                    <label key={c.id}>
                      <input
                        type="checkbox"
                        checked={selected.includes(c.id)}
                        onChange={() => toggle(c.id)}
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              </>
            )}
            {dialog.kind === "members" && (
              <>
                <p>
                  选择加入“{selectedCollection?.name}
                  ”的书籍。取消勾选只会移出此合集。
                </p>
                {!active.length && <p>书架为空，请先导入 PDF。</p>}
                <div className="collection-checklist">
                  {active.map((b) => (
                    <label key={b.id}>
                      <input
                        type="checkbox"
                        checked={selected.includes(b.id)}
                        onChange={() => toggle(b.id)}
                      />
                      {b.title}
                    </label>
                  ))}
                </div>
              </>
            )}
            {error && (
              <p className="shelf-error" role="alert">
                {error}
              </p>
            )}
            <div className="shelf-dialog-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={close}
              >
                取消
              </button>
              <button className="primary-button" disabled={disabled}>
                {dialog.kind === "create"
                  ? "创建合集"
                  : dialog.kind === "delete"
                    ? "确认删除合集"
                    : dialog.kind === "remove"
                      ? "确认移除"
                      : "保存"}
              </button>
            </div>
          </form>
        </ShelfDialog>
      )}
    </section>
  );
}
