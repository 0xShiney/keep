import type { Highlighter, BundledLanguage } from "shiki";
import { bundledLanguages, createHighlighter } from "shiki";

/**
 * Server-side syntax highlighting. Nothing here ships to the client: the HTML is
 * produced during rendering and cached by (blob sha | content hash) + renderer
 * version. Keep an eye on the size cap below — beyond it we serve plain text.
 */

export const HIGHLIGHT_RENDERER_VERSION = "shiki-4.6.0/v1";
export const MAX_HIGHLIGHT_BYTES = 400 * 1024;

export type ThemeName = "dark" | "light";

const THEMES: Record<ThemeName, string> = {
  dark: "github-dark-default",
  light: "github-light-default",
};

const ALIASES: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  md: "markdown",
  mdx: "mdx",
  sh: "shellscript",
  bash: "shellscript",
  zsh: "shellscript",
  yml: "yaml",
  py: "python",
  rb: "ruby",
  rs: "rust",
  kt: "kotlin",
  dockerfile: "docker",
  makefile: "make",
  h: "c",
  hpp: "cpp",
  cc: "cpp",
  cs: "csharp",
  toml: "toml",
  json: "json",
  jsonc: "jsonc",
  txt: "text",
  gitignore: "text",
  env: "dotenv",
  sql: "sql",
  html: "html",
  css: "css",
  scss: "scss",
  diff: "diff",
  patch: "diff",
  go: "go",
  java: "java",
  php: "php",
  swift: "swift",
  lua: "lua",
  ini: "ini",
  xml: "xml",
  vue: "vue",
  svelte: "svelte",
};

let highlighterPromise: Promise<Highlighter> | null = null;

async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [THEMES.dark, THEMES.light],
      langs: [],
    });
  }
  return highlighterPromise;
}

export function normalizeLanguage(language: string | null | undefined): string {
  if (!language) return "text";
  const key = language.toLowerCase();
  const mapped = ALIASES[key] ?? key;
  return mapped in bundledLanguages ? mapped : "text";
}

const installedLanguages = new Set<string>();

async function ensureLanguage(highlighter: Highlighter, language: string): Promise<string> {
  const lang = normalizeLanguage(language);
  if (lang === "text") return "text";
  if (!installedLanguages.has(lang)) {
    await highlighter.loadLanguage(lang as BundledLanguage);
    installedLanguages.add(lang);
  }
  return lang;
}

export interface HighlightedCode {
  html: string;
  language: string;
  highlighted: boolean;
}

/**
 * Returns Shiki HTML with `data-line` attributes so the UI can render line
 * numbers and permalinks without a client-side highlighter.
 */
export async function highlightCode(
  code: string,
  language: string | null,
  theme: ThemeName,
): Promise<HighlightedCode> {
  if (Buffer.byteLength(code, "utf8") > MAX_HIGHLIGHT_BYTES) {
    return { html: "", language: normalizeLanguage(language), highlighted: false };
  }

  try {
    const highlighter = await getHighlighter();
    const lang = await ensureLanguage(highlighter, language ?? "text");
    const html = highlighter.codeToHtml(code, {
      lang,
      theme: THEMES[theme],
      transformers: [
        {
          line(node, line) {
            node.properties = { ...node.properties, "data-line": String(line) };
            node.children.unshift({
              type: "element",
              tagName: "span",
              properties: { class: "line-number", "aria-hidden": "true" },
              children: [{ type: "text", value: String(line) }],
            });
          },
        },
      ],
    });
    return { html, language: lang, highlighted: true };
  } catch {
    // Unknown grammar or parser failure: plain text is always acceptable.
    return { html: "", language: normalizeLanguage(language), highlighted: false };
  }
}

/** Test helper. */
export function resetHighlighter(): void {
  highlighterPromise = null;
  installedLanguages.clear();
}
