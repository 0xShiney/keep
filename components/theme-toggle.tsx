"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

type Theme = "dark" | "light";

const THEME_EVENT = "keep:themechange";

function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  window.addEventListener(THEME_EVENT, onChange);
  return () => {
    observer.disconnect();
    window.removeEventListener(THEME_EVENT, onChange);
  };
}

export function ThemeToggle() {
  // The theme lives in the document (set by the server from the cookie), so read
  // it as an external store instead of copying it into state in an effect.
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "dark" as const);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.cookie = `keep_theme=${next}; path=/; max-age=31536000; samesite=lax`;
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  const label = `Switch to ${theme === "dark" ? "light" : "dark"} theme`;

  return (
    <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={label} title={label}>
      {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  );
}
