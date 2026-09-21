import { execFileSync } from "node:child_process";

export type BuildInfo = {
  version: string;
  number: string;
  revision: string;
  modified: boolean;
  builtAt: string;
  channel: "development" | "test" | "release";
  platform: string;
  architecture: string;
};

export function buildIdentity(
  version: string,
  revision: string,
  modified: boolean,
  builtAt: string,
  platform: string,
  architecture: string,
  development: boolean,
): BuildInfo {
  const commit = /^[a-f0-9]{40}$/i.test(revision)
    ? revision.toLowerCase()
    : "unknown";
  const date = new Date(builtAt);
  if (Number.isNaN(date.valueOf())) throw new Error("Invalid build timestamp");
  const stamp = date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  return {
    version,
    number: `${stamp}-${commit.slice(0, 8)}${modified ? "-local" : ""}`,
    revision: commit,
    modified,
    builtAt: date.toISOString(),
    channel: development ? "development" : "test",
    platform,
    architecture,
  };
}

export function currentBuildInfo(
  version: string,
  development: boolean,
): BuildInfo {
  let revision = "unknown",
    modified = true;
  try {
    revision = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    modified = !!execFileSync(
      "git",
      ["status", "--porcelain", "--untracked-files=normal"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
  } catch {
    /* Source archives can be built without a .git directory. */
  }
  const info = buildIdentity(
    version,
    revision,
    modified,
    new Date().toISOString(),
    process.platform,
    process.arch,
    development,
  );
  if (!development && process.env.RHINE_BUILD_CHANNEL === "release")
    info.channel = "release";
  return info;
}
