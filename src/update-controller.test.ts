import { describe, it, expect, vi } from "vitest";
import { UpdateController, type UpdateApi } from "./update-controller";
const update = {
  version: "0.3.0",
  currentVersion: "0.2.2",
  notes: "兼容旧书库",
};
function fixture(
  overrides: Partial<UpdateApi> = {},
  save = vi.fn().mockResolvedValue(undefined),
) {
  const api = {
    preferences: vi.fn().mockResolvedValue(true),
    setAuto: vi.fn().mockResolvedValue(undefined),
    check: vi.fn().mockResolvedValue(update),
    download: vi.fn().mockResolvedValue(undefined),
    install: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const notice = vi.fn();
  return { client: new UpdateController(api, save, notice), api, save, notice };
}
describe("update safety and state", () => {
  it("checks once on startup, notifies without installing, respects auto-check opt-out", async () => {
    const { client, api, notice } = fixture();
    await client.initialize();
    await client.initialize();
    expect(api.check).toHaveBeenCalledTimes(1);
    expect(notice).toHaveBeenCalledTimes(1);
    expect(api.download).not.toHaveBeenCalled();
    expect(api.install).not.toHaveBeenCalled();
    const disabled = fixture({ preferences: async () => false });
    await disabled.client.initialize();
    expect(disabled.api.check).not.toHaveBeenCalled();
  });
  it("reports unreachable/private source as an error, not latest", async () => {
    const { client } = fixture({
      check: async () => {
        throw new Error("404/private");
      },
    });
    await client.check();
    expect(client.snapshot().phase).toBe("error");
    expect(client.snapshot().error).toContain("404/private");
    const current = fixture({ check: async () => null });
    await current.client.check();
    expect(current.client.snapshot().phase).toBe("current");
  });
  it("never installs when download or signature verification fails", async () => {
    const { client, api } = fixture({
      download: async () => {
        throw new Error("invalid signature");
      },
    });
    await client.check();
    await client.download();
    await client.install();
    expect(client.snapshot().phase).toBe("available");
    expect(api.install).not.toHaveBeenCalled();
  });
  it("waits for signature verification and successful save before installation", async () => {
    let verify!: () => void;
    const calls: string[] = [];
    const { client } = fixture(
      {
        download: () =>
          new Promise<void>((resolve) => {
            verify = resolve;
          }),
        install: async () => {
          calls.push("install");
        },
      },
      vi.fn(async () => {
        calls.push("save");
      }),
    );
    await client.check();
    const pending = client.download();
    client.progress({ phase: "verifying" });
    await client.install();
    expect(calls).toEqual([]);
    expect(client.snapshot().phase).toBe("verifying");
    verify();
    await pending;
    await client.install();
    expect(calls).toEqual(["save", "install"]);
  });
  it("keeps verified update ready if saving fails and allows retry", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValue(undefined);
    const { client, api } = fixture({}, save);
    await client.check();
    await client.download();
    await client.install();
    expect(client.snapshot().phase).toBe("ready");
    expect(api.install).not.toHaveBeenCalled();
    await client.install();
    expect(api.install).toHaveBeenCalledTimes(1);
  });
  it("deduplicates concurrent checks and permits retry after installer failure", async () => {
    const { client, api } = fixture({
      install: async () => {
        throw new Error("launch failed");
      },
    });
    await Promise.all([client.check(), client.check()]);
    expect(api.check).toHaveBeenCalledTimes(1);
    await client.download();
    await client.install();
    expect(client.snapshot().phase).toBe("available");
    expect(client.snapshot().error).toContain("launch failed");
  });
});
