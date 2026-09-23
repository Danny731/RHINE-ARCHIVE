// Browser preview keeps recovery points separate from the current library.
// Desktop uses atomic files beside the existing SQLite database.
export type BackupEntry = {
  id: string;
  createdAt: number;
  size: number;
  reason: string;
};
type Snapshot = BackupEntry & { raw: string };
export const BACKUP_LIMIT = 64 * 1024 * 1024;
const KEY = "rhine-library-backups-v1";
const INTERVAL = 30 * 60 * 1000;
const KEEP = 30;

function snapshots(): Snapshot[] {
  const raw = localStorage.getItem(KEY);
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (
    !Array.isArray(value) ||
    value.some(
      (entry) =>
        !entry ||
        typeof entry.id !== "string" ||
        typeof entry.raw !== "string" ||
        !Number.isFinite(entry.createdAt) ||
        typeof entry.reason !== "string" ||
        !Number.isFinite(entry.size),
    )
  )
    throw new Error("备份索引损坏，已停止写入；请先导出当前资料。");
  return value;
}

export function browserBackups(): BackupEntry[] {
  return snapshots()
    .map(({ raw: _raw, ...entry }) => entry)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function browserReadBackup(id: string): string {
  const entry = snapshots().find((entry) => entry.id === id);
  if (!entry) throw new Error("找不到这份备份，请刷新列表后重试。");
  if (entry.size > BACKUP_LIMIT) throw new Error("备份超过 64 MB，未读取。");
  return entry.raw;
}

export function browserSnapshot(raw: string, reason: string, now = Date.now()) {
  const entries = snapshots();
  if (reason === "auto") {
    const latest = entries
      .filter((entry) => entry.reason === "auto")
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (latest && (now - latest.createdAt < INTERVAL || latest.raw === raw))
      return;
    if (!latest && !JSON.parse(raw).books.length) return;
  }
  const entry: Snapshot = {
    id: crypto.randomUUID(),
    createdAt: now,
    reason,
    size: new Blob([raw]).size,
    raw,
  };
  let autoCount = 0;
  const retained = [
    entry,
    ...entries.sort((a, b) => b.createdAt - a.createdAt),
  ].filter((entry) => entry.reason !== "auto" || ++autoCount <= KEEP);
  // setItem is atomic: quota errors preserve both the old index and current data.
  localStorage.setItem(KEY, JSON.stringify(retained));
}

export const backupReason = (reason: string) =>
  ({
    auto: "自动备份",
    manual: "手动备份",
    "before-restore": "恢复前保护",
    "before-version-change": "升级前保护",
    "before-update": "安装前保护",
    "before-shelf-v1": "书架升级保护",
    "before-workspace-v1": "工作区升级保护",
    "before-ink-v1": "手写升级保护",
    "before-cover-v1": "封面设置保护",
  })[reason] || "历史保护备份";
