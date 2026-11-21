import { getEnv } from "@/lib/env";
import { ForgejoClient } from "./client";
import { HttpForgejoGateway } from "./http-gateway";
import { FixtureForgejoGateway } from "./fixture-gateway";
import type { ForgejoGateway } from "./gateway";

/**
 * Builds the gateway for a request. Fixture mode is explicitly opt-in and shows
 * a persistent demo banner in the UI; it is never a fallback for a failed
 * Forgejo connection.
 */
export function createGateway(username: string, accessToken: string): ForgejoGateway {
  const env = getEnv();
  if (env.KEEP_BACKEND === "fixture") {
    return FixtureForgejoGateway.singleton();
  }
  const client = ForgejoClient.fromEnv(accessToken);
  return new HttpForgejoGateway(client, username, username);
}

export function isFixtureMode(): boolean {
  return getEnv().KEEP_BACKEND === "fixture";
}
