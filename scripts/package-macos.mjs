import { spawn } from "node:child_process";

if (process.platform !== "darwin") {
  console.error(
    "Mac 测试包需要在 macOS 上构建，也可运行 GitHub Actions 的 macOS test build 工作流。",
  );
  process.exit(1);
}
const child = spawn(
  process.execPath,
  [
    "scripts/tauri.mjs",
    "build",
    "--ci",
    "--target",
    "aarch64-apple-darwin",
    "--bundles",
    "app,dmg",
    "--",
    "--locked",
  ],
  { stdio: "inherit", env: { ...process.env, APPLE_SIGNING_IDENTITY: "-" } },
);
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
