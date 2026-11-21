import { cookies } from "next/headers";
import type { ThemeName } from "@/lib/render/highlight";

/**
 * Theme resolution.
 *
 * The active theme must be known on the server so Shiki colours and the page
 * background always agree. Dark is the default and primary design target; a
 * light override is stored in a non-sensitive cookie. `prefers-color-scheme` is
 * deliberately not used for the initial paint because a server-rendered
 * highlight cannot react to it without a flash. See docs/DECISIONS.md D-012.
 */

export const THEME_COOKIE = "keep_theme";
export type ThemePref = ThemeName;

export async function getThemePref(): Promise<ThemePref> {
  const jar = await cookies();
  const value = jar.get(THEME_COOKIE)?.value;
  return value === "light" ? "light" : "dark";
}

export function isThemePref(value: string | undefined): value is ThemePref {
  return value === "dark" || value === "light";
}
