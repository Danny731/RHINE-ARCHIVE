import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { desktop } from "../storage";
import { UpdateController, type Progress } from "../update-controller";
import { version } from "../../package.json";
import { isMac } from "../platform";

export default function UpdatePanel({
  visible,
  beforeInstall,
  onAvailable,
  onInstallingChange,
}: {
  visible: boolean;
  beforeInstall: () => Promise<void>;
  onAvailable: () => void;
  onInstallingChange: (installing: boolean) => void;
}) {
  const callbacks = useRef({ beforeInstall, onAvailable });
  callbacks.current = { beforeInstall, onAvailable };
  const [controller] = useState(
    () =>
      new UpdateController(
        {
          preferences: () => invoke("update_preferences"),
          setAuto: (enabled) => invoke("set_auto_updates", { enabled }),
          check: () => invoke("check_for_update"),
          download: () => invoke("download_update"),
          install: () => invoke("install_update"),
        },
        () => callbacks.current.beforeInstall(),
        () => callbacks.current.onAvailable(),
      ),
  );
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  useEffect(() => {
    onInstallingChange(state.phase === "installing");
  }, [state.phase, onInstallingChange]);
  useEffect(() => {
    if (!desktop || isMac) return;
    const pending = listen<Progress>("update-progress", ({ payload }) =>
      controller.progress(payload),
    );
    void controller.initialize();
    return () => {
      void pending.then((off) => off()).catch(() => {});
    };
  }, [controller]);
  if (!visible) return null;
  const working = [
    "checking",
    "downloading",
    "verifying",
    "installing",
  ].includes(state.phase);
  const progress = state.total
    ? `${Math.min(100, Math.round((state.received / state.total) * 100))}%`
    : `${(state.received / 1048576).toFixed(1)} MB`;
  return (
    <div className="setting-section update-section" aria-label="软件更新">
      <h3>
        软件更新 <small>当前版本 {version}</small>
      </h3>
      {isMac ? (
        <p>
          Mac
          测试版暂不支持应用内升级。请正常退出应用后，用新版替换“应用程序”中的
          RHINE ARCHIVE；书库和笔记保存在独立的数据目录中。升级前可先导出 JSON
          备份。
        </p>
      ) : !desktop ? (
        <p>应用内升级仅在 Windows 桌面版中提供。</p>
      ) : (
        <>
          <label>
            <input
              type="checkbox"
              checked={state.auto}
              disabled={working}
              onChange={(event) =>
                void controller.setAuto(event.target.checked)
              }
            />{" "}
            启动时自动检查新版本
          </label>
          <p role="status">
            {
              {
                idle: "可检查是否有新版本",
                checking: "正在检查更新…",
                current: "当前已是最新版本",
                available: `发现新版本 ${state.update?.version || ""}`,
                downloading: `正在下载更新 ${progress}`,
                verifying: "正在验证更新包签名…",
                ready: "更新包已下载并通过签名校验",
                installing: "正在保存资料并启动安装程序…",
                error: "暂时无法检查更新",
              }[state.phase]
            }
          </p>
          {state.error && (
            <p className="update-error" role="alert">
              {state.error}
            </p>
          )}
          {state.update?.notes && (
            <pre className="update-notes">{state.update.notes}</pre>
          )}
          <div className="update-actions">
            <button
              className="secondary-button"
              disabled={working || state.phase === "ready"}
              onClick={() => void controller.check()}
            >
              检查更新
            </button>
            {state.phase === "available" && (
              <button
                className="primary-button"
                onClick={() => void controller.download()}
              >
                下载新版
              </button>
            )}
            {state.phase === "ready" && (
              <button
                className="primary-button"
                onClick={() => void controller.install()}
              >
                保存资料并安装新版
              </button>
            )}
          </div>
          <p className="update-hint">
            仅检查版本信息，不上传 PDF
            或阅读资料。下载后由你选择安装，安装前自动备份书库。
          </p>
          <p className="update-hint">
            升级通过安装程序完成。直接运行版将转为安装版，请之后从开始菜单启动；原来的独立
            exe 不会被替换。
          </p>
        </>
      )}
    </div>
  );
}
