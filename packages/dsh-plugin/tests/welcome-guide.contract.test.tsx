import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { Context } from "@deepseek-ai/cordis";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Config, readWelcomeGuideConfig } from "../src/index.js";
import {
  OhStoryPluginConfig,
  WelcomeGuide,
  WelcomeGuideController,
  type WelcomeConfigForm
} from "../src/client/welcome-guide.js";
import type { WorkbenchPreferenceStorage } from "../src/client/workbench-presence.js";
import { registerWorkspaceRoute } from "../src/workspace-route.js";

function memoryStorage(entries: Record<string, string> = {}): WorkbenchPreferenceStorage & { readonly entries: Record<string, string> } {
  return {
    entries,
    getItem: (key) => entries[key] ?? null,
    setItem: (key, value) => { entries[key] = value; }
  };
}

function createMockConfigForm(initial: {
  status?: "loading" | "ready" | "unavailable";
  welcomeGuide?: boolean | undefined;
  writable?: boolean;
  acceptWrites?: boolean;
} = {}) {
  const listeners = new Set<() => void>();
  let snapshot = {
    status: initial.status ?? "ready",
    value: initial.welcomeGuide === undefined ? {} : { welcomeGuide: initial.welcomeGuide },
    writable: initial.writable ?? true
  };
  const setCalls: boolean[] = [];
  const form: WelcomeConfigForm & {
    readonly setCalls: readonly boolean[];
    updateSnapshot: (next: typeof snapshot) => void;
  } = {
    setCalls,
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    set: vi.fn(async (_field: "welcomeGuide", value: boolean) => {
      setCalls.push(value);
      if (initial.acceptWrites === false) return false;
      snapshot = { ...snapshot, value: { welcomeGuide: value } };
      for (const listener of [...listeners]) listener();
      return true;
    }),
    updateSnapshot: (next) => {
      snapshot = next;
      for (const listener of [...listeners]) listener();
    }
  };
  return form;
}

describe("welcomeGuide Host Config contract", () => {
  it("declares a volatile boolean defaulting to true and reads live volatile refs", () => {
    const defaults = Config({});
    expect(readWelcomeGuideConfig(defaults.welcomeGuide)).toBe(true);

    const disabled = Config({ welcomeGuide: false });
    expect(readWelcomeGuideConfig(disabled.welcomeGuide)).toBe(false);

    let live = true;
    const volatileRef = { get: () => live };
    expect(readWelcomeGuideConfig(volatileRef)).toBe(true);
    live = false;
    expect(readWelcomeGuideConfig(volatileRef)).toBe(false);
    expect(readWelcomeGuideConfig(undefined)).toBe(true);
  });

  it("exposes live welcomeGuide state on /oh-story/config without requiring a Session", async () => {
    let welcomeGuide = true;
    let routeHandler: ((request: IncomingMessage, response: ServerResponse) => Promise<void>) | undefined;
    const root = new Context();
    await root.plugin({
      name: "webserver-stub",
      apply(context) {
        context.provide("webServer", {
          register(spec: { readonly handler: (request: IncomingMessage, response: ServerResponse) => Promise<void> }) {
            routeHandler = spec.handler;
            return () => { routeHandler = undefined; };
          }
        });
      }
    });
    const mount = await root.plugin({
      name: "mount-route",
      inject: ["webServer"],
      apply(context) {
        registerWorkspaceRoute(context, {
          maxBytes: 65_536,
          welcomeGuide: () => welcomeGuide
        });
      }
    });

    const server = createServer((request, response) => {
      if (routeHandler === undefined) {
        response.writeHead(500).end();
        return;
      }
      void routeHandler(request, response);
    });
    await new Promise<void>((resolve) => { server.listen(0, "127.0.0.1", resolve); });
    try {
      const { port } = server.address() as AddressInfo;
      const origin = `http://127.0.0.1:${String(port)}`;
      const first = await fetch(`${origin}/oh-story/config`, { headers: { origin } });
      expect(first.status).toBe(200);
      expect(await first.json()).toEqual({ welcomeGuide: true });

      welcomeGuide = false;
      const second = await fetch(`${origin}/oh-story/config`, { headers: { origin } });
      expect(second.status).toBe(200);
      expect(await second.json()).toEqual({ welcomeGuide: false });
    } finally {
      await new Promise<void>((resolve) => { server.close(() => { resolve(); }); });
      await mount.dispose();
    }
  });
});

describe("WelcomeGuide and OhStoryPluginConfig UI contract", () => {
  it("explains the real boundary between installed workbench and skill-enabled presets", () => {
    const onDismiss = vi.fn();
    const markup = renderToStaticMarkup(<WelcomeGuide onDismiss={onDismiss} />);

    expect(markup).toContain("Oh Story 创作工作台");
    expect(markup).not.toContain("Oh Story 已加载");
    expect(markup).toContain("Minimal");
    expect(markup).toContain("Standard");
    expect(markup).toContain("关闭欢迎引导");
    expect(markup).toContain("welcomeGuide");

    const element = WelcomeGuide({ onDismiss });
    const header = (element.props.children as readonly { readonly props?: { readonly children?: unknown } }[])[1];
    const children = header?.props?.children as readonly { readonly props?: { readonly onClick?: () => void } }[];
    children[1]?.props?.onClick?.();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("toggles and persists welcomeGuide through DSH ConfigForm when writable", async () => {
    const store = memoryStorage();
    const controller = new WelcomeGuideController(() => store);
    const form = createMockConfigForm({ welcomeGuide: true, writable: true });
    controller.connectForm(form);

    const enabledMarkup = renderToStaticMarkup(<OhStoryPluginConfig controller={controller} />);
    expect(enabledMarkup).toContain('role="switch"');
    expect(enabledMarkup).toContain('aria-label="空白会话欢迎引导"');
    expect(enabledMarkup).toContain('aria-checked="true"');

    expect(await controller.setEnabled(false)).toBe(true);
    expect(form.setCalls).toEqual([false]);
    const disabledMarkup = renderToStaticMarkup(<OhStoryPluginConfig controller={controller} />);
    expect(disabledMarkup).toContain('aria-checked="false"');
    expect(renderToStaticMarkup(<OhStoryPluginConfig view="summary" controller={controller} />)).toContain("空白会话欢迎引导：已关闭");

    expect(await controller.setEnabled(true)).toBe(true);
    expect(form.setCalls).toEqual([false, true]);
    expect(renderToStaticMarkup(<OhStoryPluginConfig controller={controller} />)).toContain('aria-checked="true"');
  });

  it("surfaces an alert when a Host write fails and locks read-only Host disables", async () => {
    const controller = new WelcomeGuideController(() => memoryStorage());
    const rejectingForm = createMockConfigForm({ welcomeGuide: true, writable: true, acceptWrites: false });
    controller.connectForm(rejectingForm);

    expect(await controller.setEnabled(false)).toBe(false);
    const failedMarkup = renderToStaticMarkup(<OhStoryPluginConfig controller={controller} />);
    expect(failedMarkup).toContain('role="alert"');
    expect(failedMarkup).toContain('aria-checked="true"');

    const lockedController = new WelcomeGuideController(() => memoryStorage());
    lockedController.connectForm(createMockConfigForm({ welcomeGuide: false, writable: false }));
    const lockedMarkup = renderToStaticMarkup(<OhStoryPluginConfig controller={lockedController} />);
    expect(lockedMarkup).toContain('aria-checked="false"');
    expect(lockedMarkup).toContain("disabled");
    expect(lockedMarkup).toContain("welcomeGuide: false");
  });

  it("persists fallback toggle in browser storage on profileless hosts", async () => {
    const store = memoryStorage();
    const first = new WelcomeGuideController(() => store);
    first.connectForm(createMockConfigForm({ status: "unavailable", writable: false }));
    first.ensureFallbackHostConfig(() => Promise.resolve(true));
    await Promise.resolve();

    expect(renderToStaticMarkup(<OhStoryPluginConfig controller={first} />)).toContain('aria-checked="true"');
    expect(await first.setEnabled(false)).toBe(true);
    expect(renderToStaticMarkup(<OhStoryPluginConfig controller={first} />)).toContain('aria-checked="false"');

    const reloaded = new WelcomeGuideController(() => store);
    reloaded.connectForm(createMockConfigForm({ status: "unavailable", writable: false }));
    reloaded.ensureFallbackHostConfig(() => Promise.resolve(true));
    await Promise.resolve();
    expect(renderToStaticMarkup(<OhStoryPluginConfig controller={reloaded} />)).toContain('aria-checked="false"');
  });
});
