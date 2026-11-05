import type { CanvasViewport } from "./canvas-viewport.js";
import type { CanvasPoint } from "./production-runtime.js";

export interface GameProject {
  readonly id: string;
  readonly root: string;
  readonly title: string;
  readonly source: "workspace" | "example";
  readonly previewReady: boolean;
  readonly previewUrl?: string | undefined;
  readonly previewVersion: string;
}

export interface GameWorkspaceFile {
  readonly path: string;
  readonly bytes: number;
  readonly version: string;
  readonly kind: "text" | "media";
  readonly mimeType?: string | undefined;
}

export interface GameDocumentBuffer {
  readonly content: string;
  readonly saved: string;
  readonly source: "disk" | "human" | "agent";
  readonly version: string;
  readonly saving?: boolean | undefined;
  readonly error?: string | undefined;
  readonly missing?: boolean | undefined;
  readonly conflict?: { readonly message: string; readonly theirs?: string | undefined; readonly theirsVersion?: string | undefined } | undefined;
}

export interface GameCanvasState {
  readonly positions: Readonly<Record<string, CanvasPoint>>;
  readonly viewport?: CanvasViewport | undefined;
  readonly selectedId?: string | undefined;
}

export const EMPTY_GAME_CANVAS: GameCanvasState = { positions: {} };
export type GameWorkspaceTab = "preview" | "canvas" | "design";
