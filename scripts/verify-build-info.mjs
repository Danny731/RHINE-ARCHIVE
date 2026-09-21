import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const info = JSON.parse(await readFile("dist/build-info.json", "utf8"));
const head = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const version = JSON.parse(await readFile("package.json", "utf8")).version;
const channel = process.env.RHINE_BUILD_CHANNEL || "test";
if (!["test", "release"].includes(channel)) {
  throw new Error("Expected a test or release build channel.");
}
if (
  info.revision !== head ||
  info.version !== version ||
  info.modified ||
  info.channel !== channel ||
  info.platform !== process.platform ||
  info.architecture !== process.arch ||
  !/^\d{8}T\d{6}Z-[a-f0-9]{8}$/.test(info.number)
) {
  throw new Error(
    "Build metadata does not match the clean source checkout and current platform.",
  );
}
console.log(
  `Verified ${channel} build ${info.version} / ${info.number} / ${info.platform}-${info.architecture}`,
);
