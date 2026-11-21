"use client";

import { useState } from "react";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { FormFeedback } from "@/components/forms/form-bits";
import { useApiAction } from "@/components/forms/use-api-action";
import { Label } from "@/components/ui/input";

export function PrefsForm({
  initialTheme,
  initialDensity,
  initialDiffMode,
}: {
  initialTheme: "dark" | "light";
  initialDensity: "compact" | "comfortable";
  initialDiffMode: "unified" | "split";
}) {
  const action = useApiAction();
  const [theme, setTheme] = useState(initialTheme);
  const [density, setDensity] = useState(initialDensity);
  const [diffMode, setDiffMode] = useState(initialDiffMode);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        await action.run(
          () => apiRequest("/api/v1/prefs", { method: "PUT", body: { theme, density, diffMode } }),
          { successMessage: "Preferences saved." },
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Label htmlFor="pref-theme" className="text-fg-muted text-xs font-normal">
          Theme
          <select
            id="pref-theme"
            value={theme}
            onChange={(event) => {
              const next = event.target.value as "dark" | "light";
              setTheme(next);
              // Apply immediately and persist in a cookie so the next server
              // render highlights code with the matching Shiki theme.
              document.documentElement.dataset.theme = next;
              document.cookie = `keep_theme=${next}; path=/; max-age=31536000; samesite=lax`;
            }}
            className="border-border bg-surface-2 text-fg h-8 rounded-sm border px-2 text-sm"
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </Label>
        <Label htmlFor="pref-density" className="text-fg-muted text-xs font-normal">
          Density
          <select
            id="pref-density"
            value={density}
            onChange={(event) => setDensity(event.target.value as typeof density)}
            className="border-border bg-surface-2 text-fg h-8 rounded-sm border px-2 text-sm"
          >
            <option value="compact">Compact</option>
            <option value="comfortable">Comfortable</option>
          </select>
        </Label>
        <Label htmlFor="pref-diff" className="text-fg-muted text-xs font-normal">
          Default diff view
          <select
            id="pref-diff"
            value={diffMode}
            onChange={(event) => setDiffMode(event.target.value as typeof diffMode)}
            className="border-border bg-surface-2 text-fg h-8 rounded-sm border px-2 text-sm"
          >
            <option value="unified">Unified</option>
            <option value="split">Split</option>
          </select>
        </Label>
      </div>
      <FormFeedback error={action.error} success={action.success} />
      <div>
        <Button type="submit" variant="primary" size="sm" disabled={action.pending}>
          {action.pending ? "Saving…" : "Save preferences"}
        </Button>
      </div>
    </form>
  );
}
