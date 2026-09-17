export type UpdateInfo = {
  version: string;
  currentVersion: string;
  notes: string;
};
export type Progress = {
  phase: "downloading" | "verifying";
  received?: number;
  total?: number;
};
export type UpdateState = {
  phase:
    | "idle"
    | "checking"
    | "current"
    | "available"
    | "downloading"
    | "verifying"
    | "ready"
    | "installing"
    | "error";
  update?: UpdateInfo;
  received: number;
  total?: number;
  error?: string;
  auto: boolean;
};
export interface UpdateApi {
  preferences(): Promise<boolean>;
  setAuto(enabled: boolean): Promise<void>;
  check(): Promise<UpdateInfo | null>;
  download(): Promise<void>;
  install(): Promise<void>;
}
export class UpdateController {
  private state: UpdateState = { phase: "idle", received: 0, auto: true };
  private listeners = new Set<() => void>();
  private running = false;
  private initialized = false;
  constructor(
    private api: UpdateApi,
    private beforeInstall: () => Promise<void>,
    private onAvailable: () => void,
  ) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private set(patch: Partial<UpdateState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  async initialize() {
    if (this.initialized) return;
    this.initialized = true;
    try {
      const auto = await this.api.preferences();
      this.set({ auto });
      if (auto) await this.check();
    } catch (error) {
      this.set({ phase: "error", error: String(error) });
    }
  }
  async setAuto(auto: boolean) {
    try {
      await this.api.setAuto(auto);
      this.set({ auto, error: undefined });
    } catch (error) {
      this.set({ error: String(error) });
    }
  }
  async check() {
    if (this.running || this.state.phase === "ready") return;
    this.running = true;
    this.set({
      phase: "checking",
      error: undefined,
      update: undefined,
      received: 0,
      total: undefined,
    });
    try {
      const update = await this.api.check();
      this.set({
        phase: update ? "available" : "current",
        update: update || undefined,
      });
      if (update) this.onAvailable();
    } catch (error) {
      this.set({ phase: "error", error: String(error) });
    } finally {
      this.running = false;
    }
  }
  progress = (progress: Progress) => {
    if (!["downloading", "verifying"].includes(this.state.phase)) return;
    this.set({
      phase: progress.phase,
      received: progress.received ?? this.state.received,
      total: progress.total ?? this.state.total,
    });
  };
  async download() {
    if (this.running || !this.state.update) return;
    this.running = true;
    this.set({
      phase: "downloading",
      received: 0,
      total: undefined,
      error: undefined,
    });
    try {
      await this.api.download();
      this.set({ phase: "ready" });
    } catch (error) {
      this.set({ phase: "available", error: String(error) });
    } finally {
      this.running = false;
    }
  }
  async install() {
    if (this.running || this.state.phase !== "ready") return;
    this.running = true;
    this.set({ phase: "installing", error: undefined });
    let saved = false;
    try {
      await this.beforeInstall();
      saved = true;
      await this.api.install();
    } catch (error) {
      this.set({ phase: saved ? "available" : "ready", error: String(error) });
    } finally {
      this.running = false;
    }
  }
}
