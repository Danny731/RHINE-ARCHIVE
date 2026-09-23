import { buildSummary } from "./build-info";

export type FailureOperation =
  "load" | "save" | "backup" | "restore" | "export" | "open" | "close";
export type Failure = ReturnType<typeof describeFailure>;
const labels: Record<FailureOperation, string> = {
  load: "书库读取失败",
  save: "阅读资料保存失败",
  backup: "备份操作失败",
  restore: "备份恢复失败",
  export: "资料导出失败",
  open: "PDF 打开失败",
  close: "窗口关闭失败",
};
export function describeFailure(operation: FailureOperation, error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : error && typeof error === "object" && "message" in error
          ? String(error.message)
          : "未提供错误详情";
  const classification = `${error instanceof Error ? error.name : ""}: ${message}`;
  let code = "UNKNOWN",
    reason = "操作未能完成。",
    action = "请重试；如仍失败，可复制诊断摘要反馈。";
  if (
    /quota|disk.*full|no space|磁盘.*满|空间不足|os error (28|112)/i.test(
      classification,
    )
  ) {
    code = "STORAGE_FULL";
    reason = "存储空间不足，或浏览器存储额度已用尽。";
    action =
      "先导出当前资料到其他位置，再释放磁盘空间并重试。不要清除应用数据。";
  } else if (
    /permission|access.*denied|read.only|权限|拒绝访问|os error (5|13)/i.test(
      message,
    )
  ) {
    code = "ACCESS_DENIED";
    reason = "无法访问或写入所需位置。";
    action =
      "检查文件夹权限、磁盘是否只读，以及安全软件是否拦截；导出时可换一个位置。";
  } else if (/locked|busy|占用|锁定/i.test(message)) {
    code = "STORAGE_BUSY";
    reason = "资料正在被其他操作占用。";
    action = "等待其他读写操作完成后重试；仍无法保存时请先导出当前资料。";
  } else if (
    /JSON|格式|损坏|版本|记录|无效|不一致|corrupt|malformed|unexpected/i.test(
      message,
    )
  ) {
    code = "INVALID_DATA";
    reason = "资料格式损坏、不受支持，或与当前文档不匹配。";
    action = "保留原始文件，尝试另一份有效备份；不要用空书库覆盖原数据。";
  } else if (/not found|no such|找不到|已移动|不存在/i.test(message)) {
    code = "NOT_FOUND";
    reason = "所需文件或位置不存在。";
    action =
      operation === "open"
        ? "请连接原磁盘，或在书架中重新定位同一份 PDF。"
        : "请确认原磁盘已连接，刷新备份列表或重新选择文件。";
  }
  return {
    operation,
    code,
    title: labels[operation],
    reason,
    action,
    details: message.slice(0, 2000),
    at: new Date().toISOString(),
  };
}

export function diagnosticSummary(failure: Failure): string {
  // Deliberately exclude arbitrary exception strings: they may contain paths,
  // book titles, PDF content or fragments from an invalid JSON backup.
  return `${buildSummary}\n发生时间：${failure.at}\n操作：${failure.title}\n错误类别：${failure.code}\n说明：${failure.reason}`;
}
