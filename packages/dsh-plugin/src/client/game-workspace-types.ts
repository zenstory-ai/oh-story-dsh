import type { CreativeCanvasState } from "./creative-canvas.js";

export interface GameProject {
  readonly id: string;
  readonly root: string;
  readonly title: string;
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

export type GameCanvasState = CreativeCanvasState;

export const EMPTY_GAME_CANVAS: GameCanvasState = { positions: {} };
export type GameWorkspaceTab = "preview" | "canvas" | "design";
