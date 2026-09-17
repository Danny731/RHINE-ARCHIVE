import { spawn } from "node:child_process";
import { delimiter, join } from "node:path";
const env = {
  ...process.env,
  PATH:
    join(process.env.USERPROFILE || process.env.HOME || "", ".cargo", "bin") +
    delimiter +
    process.env.PATH,
};
const child = spawn(
  process.execPath,
  ["node_modules/@tauri-apps/cli/tauri.js", ...process.argv.slice(2)],
  { stdio: "inherit", env },
);
child.on("exit", (code) => process.exit(code ?? 1));
child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
