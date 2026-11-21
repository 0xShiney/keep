import { redirect } from "next/navigation";
import { getIdentity, type Identity } from "./session";
import { unauthorized } from "@/lib/errors";
import type { Viewer } from "./authorize";

/**
 * Page-level guard: redirects to the sign-in page, preserving the destination.
 * Kept separate from getIdentity() so route handlers can return 401 problem JSON
 * instead of an HTML redirect.
 */
export async function requireIdentity(nextPath?: string): Promise<Identity> {
  const identity = await getIdentity();
  if (!identity) {
    const next = nextPath && nextPath !== "/" ? `?next=${encodeURIComponent(nextPath)}` : "";
    redirect(`/login${next}`);
  }
  return identity;
}

/** API-level guard: throws a 401 problem response. */
export async function requireApiIdentity(): Promise<Identity> {
  const identity = await getIdentity();
  if (!identity) throw unauthorized();
  return identity;
}

export function asViewer(identity: Identity): Viewer {
  return { userId: identity.userId, username: identity.username, isOwner: identity.isOwner };
}
