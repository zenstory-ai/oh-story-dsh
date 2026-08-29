export type GameVerificationBinding = "CURRENT" | "PINNED" | "STALE" | "UNBOUND";

export interface GameVerificationFreshness {
  readonly binding: Exclude<GameVerificationBinding, "PINNED">;
  readonly verifiedPreviewVersion?: string | undefined;
}

interface Observation {
  readonly verificationRevision: string | undefined;
  readonly previewVersion: string;
  readonly bound: boolean;
}

/**
 * The upstream QA schema intentionally contains no build digest. Track what
 * this DSH process actually observes instead of pretending an imported PASS
 * belongs to the current build. A QA rewrite binds that run to the preview
 * visible at the same observation; later preview changes make it stale.
 */
export class WorkspaceVerificationTracker {
  readonly #observations = new Map<string, Observation>();

  observe(key: string, verificationRevision: string | undefined, previewVersion: string): GameVerificationFreshness {
    const previous = this.#observations.get(key);
    if (previous === undefined) {
      this.#remember(key, { verificationRevision, previewVersion, bound: false });
      return { binding: "UNBOUND" };
    }
    if (verificationRevision !== previous.verificationRevision) {
      const bound = verificationRevision !== undefined;
      this.#remember(key, { verificationRevision, previewVersion, bound });
      return bound ? { binding: "CURRENT", verifiedPreviewVersion: previewVersion } : { binding: "UNBOUND" };
    }
    if (!previous.bound) return { binding: "UNBOUND" };
    return previewVersion === previous.previewVersion
      ? { binding: "CURRENT", verifiedPreviewVersion: previous.previewVersion }
      : { binding: "STALE", verifiedPreviewVersion: previous.previewVersion };
  }

  #remember(key: string, observation: Observation): void {
    this.#observations.set(key, observation);
    if (this.#observations.size <= 500) return;
    const oldest = this.#observations.keys().next();
    if (!oldest.done) this.#observations.delete(oldest.value);
  }
}
