import type { Session, SessionEvent } from "@deepseek-ai/dsh-session";
import type {} from "@deepseek-ai/dsh-subagent";
import { OH_STORY_ROLE_NAMES, type OhStoryRoleName } from "./role-provider.js";

const ROLE_LABEL_PREFIX = "oh-story:";

/** The durable creation label oh_story_role gives every child it starts. */
export function ohStoryRoleLabel(role: OhStoryRoleName): string {
  return `${ROLE_LABEL_PREFIX}${role}`;
}

function roleFromLabel(label: unknown): OhStoryRoleName | undefined {
  if (typeof label !== "string" || !label.startsWith(ROLE_LABEL_PREFIX)) return undefined;
  const name = label.slice(ROLE_LABEL_PREFIX.length);
  return OH_STORY_ROLE_NAMES.find((role) => role === name);
}

// Keyed by the live Session object: a one-shot child keeps one Session for its
// whole life, and a WeakMap releases the entry with the child.
const roleSessions = new WeakMap<Session, OhStoryRoleName>();

/**
 * Record the Role of a child whose Session DSH has just stamped with its
 * `subagent/descriptor`. The in-process spawn driver appends that event inside
 * the child's first step, before its first model request, so the identity is
 * known before the child can call any tool. The first descriptor is
 * authoritative, as in DSH's own `foldSubagentDescriptor`.
 */
export function observeOhStoryRoleDescriptor(session: Session, event: SessionEvent): void {
  if (event.type !== "subagent/descriptor" || roleSessions.has(session)) return;
  const role = roleFromLabel((event.data as { readonly label?: unknown }).label);
  if (role !== undefined) roleSessions.set(session, role);
}

/** Record a Role for a child Session the Role tool started itself. */
export function markOhStoryRoleSession(session: Session, role: OhStoryRoleName): void {
  if (!roleSessions.has(session)) roleSessions.set(session, role);
}

/** The Oh Story Role running in this Session, if it is an oh_story_role child. */
export function ohStoryRoleOfSession(session: Session | undefined): OhStoryRoleName | undefined {
  return session === undefined ? undefined : roleSessions.get(session);
}
