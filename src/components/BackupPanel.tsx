import { useEffect, useState } from "react";
import { backupReason, type BackupEntry } from "../backup-store";
import { exportText, listBackups, readBackup } from "../storage";
import { validateLibrary, type Library } from "../model";
import type { FailureOperation } from "../diagnostics";

export type BackupPreview = { library: Library; label: string };
export default function BackupPanel({
  visible,
  disabled,
  storageError,
  preview,
  onPreview,
  onCreate,
  onRestore,
  onError,
}: {
  visible: boolean;
  disabled: boolean;
  storageError: boolean;
  preview: BackupPreview | null;
  onPreview: (value: BackupPreview | null) => void;
  onCreate: () => Promise<void>;
  onRestore: (library: Library, mode: "merge" | "replace") => Promise<void>;
  onError: (operation: FailureOperation, error: unknown) => void;
}) {
  const [entries, setEntries] = useState<BackupEntry[]>([]);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  async function refresh() {
    setEntries(await listBackups());
  }
  useEffect(() => {
    if (!visible) return;
    let active = true;
    void listBackups()
      .then((items) => {
        if (active) setEntries(items);
      })
      .catch((error) => {
        if (active) onError("backup", error);
      });
    return () => {
      active = false;
    };
  }, [visible, onError]);
  async function run(operation: FailureOperation, action: () => Promise<void>) {
    if (working || disabled) return;
    setWorking(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      onError(operation, error);
    } finally {
      setWorking(false);
    }
  }
  return (
    <div className="setting-section backup-center" aria-label="本地备份管理">
      <h3>自动备份与恢复</h3>
      <p>
        资料有变化时，每隔 30 分钟保留一个自动恢复点，最近 30
        份自动轮换。手动、升级前和恢复前的保护备份长期保留。备份均不包含 PDF
        原文件。
      </p>
      <div className="setting-buttons">
        <button
          className="secondary-button"
          disabled={working || disabled || storageError}
          onClick={() =>
            void run("backup", async () => {
              await onCreate();
              await refresh();
              setMessage("已创建本地备份");
            })
          }
        >
          立即备份
        </button>
        <button
          className="text-button"
          disabled={working || disabled}
          onClick={() => void run("backup", refresh)}
        >
          刷新备份列表
        </button>
      </div>
      {!entries.length && (
        <p>暂无本地恢复点。可立即备份，或导入已有的 JSON 备份。</p>
      )}
      <ul className="backup-list">
        {entries.map((entry) => (
          <li key={entry.id}>
            <div>
              <strong>{backupReason(entry.reason)}</strong>
              <small>
                {new Date(entry.createdAt).toLocaleString()} ·{" "}
                {Math.max(1, Math.ceil(entry.size / 1024))} KB
              </small>
            </div>
            <button
              className="text-button"
              disabled={working || disabled}
              onClick={() =>
                void run("restore", async () => {
                  onPreview({
                    library: validateLibrary(
                      JSON.parse(await readBackup(entry.id)),
                    ),
                    label: `${backupReason(entry.reason)} · ${new Date(entry.createdAt).toLocaleString()}`,
                  });
                })
              }
            >
              预览恢复
            </button>
            <button
              className="text-button"
              disabled={working || disabled}
              onClick={() =>
                void run("export", async () => {
                  if (
                    await exportText(
                      await readBackup(entry.id),
                      `RHINE-ARCHIVE-backup-${entry.createdAt}.json`,
                    )
                  )
                    setMessage("备份已导出");
                })
              }
            >
              导出
            </button>
          </li>
        ))}
      </ul>
      {preview && (
        <div className="backup-preview" role="region" aria-label="备份恢复预览">
          <h4>确认恢复内容</h4>
          <p>{preview.label}</p>
          <p>
            {preview.library.books.length} 本书 ·{" "}
            {preview.library.books.reduce((n, b) => n + b.marks.length, 0)}{" "}
            条标注与笔记 ·{" "}
            {preview.library.books.reduce(
              (n, b) => n + (b.inkStrokes?.length || 0),
              0,
            )}{" "}
            笔手写
          </p>
          <p>
            合并会保留当前资料，同一条笔记以当前内容为准。回退会用这份备份替换当前书架与阅读状态。两种操作都会先保留恢复前的书库；保护备份失败时不会覆盖资料。
          </p>
          <div className="setting-buttons">
            <button
              className="primary-button"
              disabled={working || disabled}
              onClick={() =>
                void run("restore", async () => {
                  await onRestore(preview.library, "merge");
                  onPreview(null);
                  setMessage("备份已合并恢复");
                  await refresh().catch((error) => onError("backup", error));
                })
              }
            >
              合并恢复
            </button>
            <button
              className="secondary-button"
              disabled={working || disabled}
              onClick={() =>
                void run("restore", async () => {
                  await onRestore(preview.library, "replace");
                  onPreview(null);
                  setMessage("已回退到所选备份，可从恢复前保护备份找回原状态");
                  await refresh().catch((error) => onError("backup", error));
                })
              }
            >
              回退到此备份
            </button>
            <button
              className="text-button"
              disabled={working}
              onClick={() => onPreview(null)}
            >
              取消恢复
            </button>
          </div>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
