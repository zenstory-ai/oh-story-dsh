/** Public input capabilities differ between DSH 0.2.0 and 0.2.1. */
interface ChatInput<Binding extends { readonly ctx: unknown }> {
  readonly requestDraftInitialization?: ((binding: Binding, initial: { readonly prompt: string; readonly whenDraftExists: "keep" }) => "applied" | "preserved" | "blocked") | undefined;
  for(context: Binding["ctx"]): { focus(): void };
}

/** False asks the workbench to retain the context visibly when the host did not apply it. */
export function focusChatContext<Binding extends { readonly ctx: unknown }>(input: ChatInput<Binding>, binding: Binding, prompt?: string): boolean {
  const canInitialize = typeof input.requestDraftInitialization === "function";
  const result = prompt !== undefined && canInitialize ? input.requestDraftInitialization?.(binding, { prompt, whenDraftExists: "keep" }) : undefined;
  input.for(binding.ctx).focus();
  // Legacy setDraft replaces reference chips and cannot see detached optimistic drafts.
  // Focus only: never replace text or send a message to emulate the newer transaction.
  return prompt === undefined || result === "applied";
}
