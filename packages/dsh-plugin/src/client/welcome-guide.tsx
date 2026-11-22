import { useEffect, useSyncExternalStore } from "react";
import { ohStoryEndpointUrl } from "./workbench-ui.js";
import {
  readWelcomeGuidePreference,
  resolveWelcomeGuideEnabled,
  workbenchPreferenceStorage,
  writeWelcomeGuidePreference,
  type WelcomeConfigFormStatus,
  type WorkbenchPreference,
  type WorkbenchPreferenceStorage
} from "./workbench-presence.js";

interface WelcomeConfigFormSnapshot {
  readonly status: "loading" | "ready" | "unavailable";
  readonly value?: { readonly welcomeGuide?: boolean | undefined } | undefined;
  readonly writable: boolean;
}

export interface WelcomeConfigForm {
  getSnapshot(): WelcomeConfigFormSnapshot;
  subscribe(listener: () => void): () => void;
  set(field: "welcomeGuide", value: boolean): Promise<boolean>;
}

export interface WelcomeGuideSnapshot {
  readonly formStatus: WelcomeConfigFormStatus;
  readonly hostValue: boolean | undefined;
  readonly writable: boolean;
  readonly fallbackHostValue: boolean | undefined;
  readonly optimisticValue: boolean | undefined;
  readonly localPreference: WorkbenchPreference | undefined;
  readonly saving: boolean;
  readonly error: string | undefined;
}

async function fetchWelcomeGuideConfig(): Promise<boolean> {
  const response = await fetch(ohStoryEndpointUrl("config"));
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
  const payload = await response.json() as { readonly welcomeGuide?: unknown };
  return payload.welcomeGuide !== false;
}

export class WelcomeGuideController {
  private readonly listeners = new Set<() => void>();
  private form: WelcomeConfigForm | undefined;
  private fallbackProbe: Promise<void> | undefined;
  private snapshot: WelcomeGuideSnapshot;

  constructor(private readonly getStorage: () => WorkbenchPreferenceStorage | undefined = workbenchPreferenceStorage) {
    this.snapshot = {
      formStatus: "absent",
      hostValue: undefined,
      writable: false,
      fallbackHostValue: undefined,
      optimisticValue: undefined,
      localPreference: readWelcomeGuidePreference(this.getStorage()),
      saving: false,
      error: undefined
    };
  }

  readonly getSnapshot = (): WelcomeGuideSnapshot => this.snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private update(patch: Partial<WelcomeGuideSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of [...this.listeners]) listener();
  }

  connectForm(form: WelcomeConfigForm): () => void {
    this.form = form;
    const sync = (): void => {
      const next = form.getSnapshot();
      this.update({
        formStatus: next.status,
        hostValue: next.value?.welcomeGuide,
        writable: next.writable
      });
    };
    sync();
    const unsubscribe = form.subscribe(sync);
    return () => {
      unsubscribe();
      if (this.form === form) {
        this.form = undefined;
        this.update({ formStatus: "absent", hostValue: undefined, writable: false });
      }
    };
  }

  ensureFallbackHostConfig(load: () => Promise<boolean> = fetchWelcomeGuideConfig): void {
    const { formStatus, hostValue, fallbackHostValue } = this.snapshot;
    if ((formStatus !== "absent" && formStatus !== "unavailable") || hostValue !== undefined || fallbackHostValue !== undefined) return;
    if (this.fallbackProbe !== undefined) return;
    this.fallbackProbe = load()
      .then((enabled) => {
        this.update({ fallbackHostValue: enabled });
      })
      .catch(() => {
        // Leave fallbackHostValue undefined on transient failure; workspace payload or retry can resolve it.
      })
      .finally(() => {
        this.fallbackProbe = undefined;
      });
  }

  async setEnabled(enabled: boolean): Promise<boolean> {
    const current = this.snapshot;
    const form = this.form;
    if (form !== undefined && current.formStatus === "ready" && current.writable) {
      this.update({ optimisticValue: enabled, saving: true, error: undefined });
      try {
        const accepted = await form.set("welcomeGuide", enabled);
        const latest = form.getSnapshot();
        this.update({
          formStatus: latest.status,
          hostValue: latest.value?.welcomeGuide,
          writable: latest.writable,
          optimisticValue: undefined,
          saving: false,
          error: accepted ? undefined : "未能保存欢迎引导设置，请稍后重试。"
        });
        return accepted;
      } catch (reason: unknown) {
        const latest = form.getSnapshot();
        this.update({
          formStatus: latest.status,
          hostValue: latest.value?.welcomeGuide,
          writable: latest.writable,
          optimisticValue: undefined,
          saving: false,
          error: reason instanceof Error ? reason.message : "未能保存欢迎引导设置，请稍后重试。"
        });
        return false;
      }
    }
    if (current.hostValue === false || current.fallbackHostValue === false) {
      this.update({ error: "当前宿主配置已固定关闭欢迎引导。" });
      return false;
    }
    const preference: WorkbenchPreference = enabled ? "open" : "closed";
    writeWelcomeGuidePreference(this.getStorage(), enabled);
    this.update({ localPreference: preference, optimisticValue: undefined, error: undefined });
    return true;
  }
}

/** How to reach the workbench from a DSH that has no creative work open yet. */
export function WelcomeGuide({
  onDismiss,
  dismissing = false
}: {
  readonly onDismiss?: (() => void) | undefined;
  readonly dismissing?: boolean | undefined;
} = {}) {
  return <section className="oh-story-welcome" aria-label="Oh Story 使用引导">
    <div className="oh-story-welcome-header">
      <h2>Oh Story 创作工作台</h2>
      {onDismiss !== undefined && <button
        type="button"
        className="oh-story-welcome-dismiss"
        disabled={dismissing}
        onClick={onDismiss}
      >关闭欢迎引导</button>}
    </div>
    <p>打开已有作品目录时，小说、短剧、游戏、视频工作台会自动展开。要从空白会话开始创作，输入 <code>/story</code>、<code>/short-drama</code>、<code>/novel-to-game quick</code>、<code>/video-recap</code>，或直接说说想写什么。</p>
    <ol>
      <li>直接开写：不选文件夹也能开始，作品会自动保存在 DSH 默认工作区（Default workspace）。</li>
      <li>打开已有作品：点左侧「工作区」旁的「添加工作区」，选中你的作品目录即可自动展开对应工作台。</li>
      <li>配置模型：输入框右下角显示模型名即可开始对话；只浏览和编辑已有稿件无需 API Key。</li>
    </ol>
    <p className="oh-story-welcome-note">提示：新建作品请使用支持技能的会话模式（默认 <code>Standard</code> 或 <code>PTC</code>；<code>Minimal</code> 模式不加载插件技能）。不需要引导时可点击右上角「关闭欢迎引导」，日后可在「插件 → @oh-story/dsh」或配置项 <code>welcomeGuide</code> 中重新开启。</p>
  </section>;
}

export function OhStoryPluginConfig({
  view = "page",
  controller
}: {
  readonly view?: "summary" | "page" | undefined;
  readonly controller: WelcomeGuideController;
}) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => {
    controller.ensureFallbackHostConfig();
  }, [controller]);
  const enabled = resolveWelcomeGuideEnabled({
    formStatus: snapshot.formStatus,
    hostValue: snapshot.hostValue,
    writable: snapshot.writable,
    optimisticValue: snapshot.optimisticValue,
    localPreference: snapshot.localPreference,
    workspaceWelcomeGuide: snapshot.fallbackHostValue
  });
  if (view === "summary") {
    return <span>{enabled ? "空白会话欢迎引导：已开启" : "空白会话欢迎引导：已关闭"}</span>;
  }
  const lockedByHost = !snapshot.writable && (snapshot.hostValue === false || snapshot.fallbackHostValue === false);
  const disabled = snapshot.saving || snapshot.formStatus === "loading" || lockedByHost;
  return <div className="oh-story-plugin-config">
    <div className="oh-story-plugin-config-row">
      <div className="oh-story-plugin-config-copy">
        <strong>空白会话欢迎引导</strong>
        <span>{lockedByHost
          ? <>当前宿主配置已固定关闭欢迎引导（<code>welcomeGuide: false</code>）。</>
          : "在还没有作品文件的空白会话里显示入门引导。关闭后空白会话不再显示引导卡，已有作品目录仍照常打开创作工作台。"}</span>
      </div>
      <button
        type="button"
        role="switch"
        className="oh-story-plugin-switch"
        aria-label="空白会话欢迎引导"
        aria-checked={enabled}
        disabled={disabled}
        onClick={() => { void controller.setEnabled(!enabled); }}
      ><i aria-hidden /></button>
    </div>
    {snapshot.error !== undefined && <p className="oh-story-plugin-config-error" role="alert">{snapshot.error}</p>}
  </div>;
}
