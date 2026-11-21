import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { userPref } from "@/db/schema";
import { apiContext } from "@/server/context";
import { authorize } from "@/lib/auth/authorize";
import { forbidden } from "@/lib/errors";
import { withApi } from "@/lib/http/api-route";
import { parseJson } from "@/lib/http/body";
import { jsonResponse } from "@/lib/http/problem";
import { prefsSchema } from "@/lib/schemas";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { THEME_COOKIE } from "@/lib/theme";

export const PUT = withApi(
  async (request, { requestId }) => {
    const { viewer } = await apiContext();
    const decision = authorize(viewer, "account:write", { kind: "account", userId: viewer.userId });
    if (!decision.allowed) throw forbidden();

    const input = await parseJson(request, prefsSchema);

    if (input.theme) {
      const jar = await cookies();
      jar.set(THEME_COOKIE, input.theme, {
        httpOnly: false,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    if (isDatabaseConfigured()) {
      await getDb()
        .insert(userPref)
        .values({
          userId: viewer.userId,
          theme: input.theme ?? "dark",
          density: input.density ?? "compact",
          diffMode: input.diffMode ?? "unified",
        })
        .onConflictDoUpdate({
          target: userPref.userId,
          set: {
            ...(input.theme ? { theme: input.theme } : {}),
            ...(input.density ? { density: input.density } : {}),
            ...(input.diffMode ? { diffMode: input.diffMode } : {}),
            updatedAt: new Date(),
          },
        });
    }

    return jsonResponse({ saved: true, ...input }, { requestId });
  },
  { mutation: true },
);
