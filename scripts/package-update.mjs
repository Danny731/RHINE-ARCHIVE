import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

// Builds signed artifacts locally. Publishing still requires explicit approval.
const root = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const env = { ...process.env };
if (!env.TAURI_SIGNING_PRIVATE_KEY) {
  const key = join(homedir(), ".pagewise", "keys", "updater.key");
  await access(key).catch(() => {
    throw new Error(
      "Missing update signing key. Restore the original private key or set TAURI_SIGNING_PRIVATE_KEY; do not regenerate keys for an existing update channel.",
    );
  });
  env.TAURI_SIGNING_PRIVATE_KEY = key;
  env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ??= "";
}
await mkdir(join(root, ".tools"), { recursive: true });
const config = join(root, ".tools", "signed-build.json");
await writeFile(
  config,
  JSON.stringify({ bundle: { createUpdaterArtifacts: true } }),
);
const code = await new Promise((resolve, reject) => {
  const child = spawn(
    process.execPath,
    ["scripts/tauri.mjs", "build", "--ci", "--config", config, "--", "--locked"],
    { cwd: root, env, stdio: "inherit" },
  );
  child.on("exit", (code) => resolve(code ?? 1));
  child.on("error", reject);
});
if (code !== 0) process.exit(code);
const name = `Pagewise_${pkg.version}_x64-setup.exe`;
const folder = join(root, "src-tauri", "target", "release", "bundle", "nsis");
await access(join(folder, name));
const signature = (await readFile(join(folder, `${name}.sig`), "utf8")).trim();
if (!signature) throw new Error("Installer signature is empty");
const changelog = await readFile(join(root, "CHANGELOG.md"), "utf8");
const section = changelog
  .split(/^## /m)
  .find((entry) => entry.startsWith(`${pkg.version} `));
const manifest = {
  version: pkg.version,
  notes:
    section?.split("\n").slice(1).join("\n").trim() ||
    `Pagewise ${pkg.version}`,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature,
      url: `https://github.com/Danny731/pagewise/releases/download/v${pkg.version}/${name}`,
    },
  },
};
await writeFile(
  join(folder, "latest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  `Built signed installer, signature and latest.json in ${folder}. Nothing has been uploaded.`,
);
