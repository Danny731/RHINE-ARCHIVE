import { useState } from "react";
import { buildInfo, buildSummary } from "../build-info";

export default function BuildDetails() {
  const [message, setMessage] = useState("");
  return (
    <div className="build-details" aria-label="应用构建信息">
      <div className="build-label">
        <span>
          {buildInfo.channel === "release"
            ? "正式版"
            : buildInfo.channel === "test"
              ? "测试版"
              : "开发预览"}{" "}
          · {buildInfo.version}
        </span>
        <button
          className="text-button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(buildSummary);
              setMessage("构建信息已复制");
            } catch {
              setMessage("无法访问剪贴板，可选中下方构建编号复制。");
            }
          }}
        >
          复制构建信息
        </button>
      </div>
      <div>
        构建编号 <code data-testid="build-number">{buildInfo.number}</code>
      </div>
      <small>
        {new Date(buildInfo.builtAt).toLocaleString()} · {buildInfo.platform} /{" "}
        {buildInfo.architecture}
      </small>
      {message && <small role="status">{message}</small>}
    </div>
  );
}
