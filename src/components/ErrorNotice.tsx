import { useState } from "react";
import { diagnosticSummary, type Failure } from "../diagnostics";

export default function ErrorNotice({
  failure,
  onDismiss,
  onBackups,
  onRetry,
}: {
  failure: Failure;
  onDismiss: () => void;
  onBackups: () => void;
  onRetry?: () => Promise<void>;
}) {
  const [copyState, setCopyState] = useState("");
  const [retrying, setRetrying] = useState(false);
  return (
    <aside className="error-notice" aria-label="操作错误">
      <div role="alert">
        <strong>{failure.title}</strong>
        <p>
          {failure.reason} {failure.action}
        </p>
      </div>
      {failure.operation === "load" && (
        <p>
          原始书库保留不动，自动保存已暂停。可进入备份管理导出原始数据或恢复有效备份。
        </p>
      )}
      {failure.operation === "save" && (
        <p>
          最新修改尚未保存，请先重试或在备份管理中导出当前资料，再退出应用。
        </p>
      )}
      <details>
        <summary>查看错误详情</summary>
        <pre>{failure.details}</pre>
        <small>
          复制摘要仅包含版本、时间和错误类别，不包含文件路径、书名或笔记。
        </small>
        <textarea
          aria-label="诊断摘要"
          readOnly
          value={diagnosticSummary(failure)}
        />
      </details>
      <div className="setting-buttons">
        {onRetry && (
          <button
            className="secondary-button"
            disabled={retrying}
            onClick={async () => {
              setRetrying(true);
              try {
                await onRetry();
              } finally {
                setRetrying(false);
              }
            }}
          >
            {retrying ? "正在重试…" : "重试"}
          </button>
        )}
        <button className="secondary-button" onClick={onBackups}>
          管理备份
        </button>
        <button
          className="text-button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(diagnosticSummary(failure));
              setCopyState("诊断摘要已复制");
            } catch {
              setCopyState("无法访问剪贴板，请展开详情并选中诊断摘要复制。");
            }
          }}
        >
          复制诊断摘要
        </button>
        <button className="text-button" onClick={onDismiss}>
          关闭错误提示
        </button>
      </div>
      {copyState && <small role="status">{copyState}</small>}
    </aside>
  );
}
