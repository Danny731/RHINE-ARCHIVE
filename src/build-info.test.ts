import { describe, it, expect } from "vitest";
import { buildIdentity } from "../scripts/build-info";

describe("build identity", () => {
  it("distinguishes same-version builds and flags local modifications", () => {
    const revision = "ab".repeat(20);
    const first = buildIdentity(
      "0.3.0",
      revision,
      false,
      "2026-09-21T01:00:00Z",
      "darwin",
      "arm64",
      false,
    );
    const second = buildIdentity(
      "0.3.0",
      revision,
      false,
      "2026-09-21T01:00:01Z",
      "darwin",
      "arm64",
      false,
    );
    expect(first.number).not.toBe(second.number);
    expect(first.channel).toBe("test");
    expect(first.revision).toBe(revision);
    expect(
      buildIdentity(
        "0.3.0",
        revision,
        true,
        first.builtAt,
        "win32",
        "x64",
        true,
      ).number,
    ).toContain("-local");
    expect(
      buildIdentity(
        "0.3.0",
        "not-a-commit",
        true,
        first.builtAt,
        "darwin",
        "arm64",
        true,
      ).revision,
    ).toBe("unknown");
  });
});
