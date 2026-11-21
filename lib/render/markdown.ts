import { createHash } from "node:crypto";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import type { Plugin } from "unified";
import { normalizeRepoPath } from "@/lib/git/path";

/**
 * Markdown rendering is XSS-sensitive: repository content is untrusted.
 * remark -> rehype -> a strict allowlist sanitizer. No raw HTML, no scripts, no
 * event handlers, no dangerous protocols.
 */

export const MARKDOWN_RENDERER_VERSION = "md-1";

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

const baseAttributes = defaultSchema.attributes ?? {};

/**
 * The schema object is validated by hast-util-sanitize at runtime; the cast keeps
 * unified's Plugin tuple typing from fighting the optional schema fields.
 */
const sanitize: Plugin<[unknown], HastNode> = rehypeSanitize as unknown as Plugin<
  [unknown],
  HastNode
>;

const schema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "details",
    "summary",
    "kbd",
    "mark",
    "del",
    "ins",
    "sup",
    "sub",
    "figure",
    "figcaption",
  ],
  attributes: {
    ...baseAttributes,
    code: [...(baseAttributes.code ?? []), ["className", /^language-[a-z0-9+#-]+$/i]],
    span: [...(baseAttributes.span ?? []), ["className", /^language-[a-z0-9+#-]+$/i]],
    a: [...(baseAttributes.a ?? []), ["className", /^anchor$/]],
    div: [...(baseAttributes.div ?? []), "className"],
    details: ["open"],
    summary: [],
    input: [
      ["type", "checkbox"],
      ["checked", true],
      ["disabled", true],
    ],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ["http", "https", "mailto"],
    src: ["http", "https"],
  },
  strip: ["script", "style", "iframe", "object", "embed", "form", "link", "meta"],
};

export interface MarkdownRenderOptions {
  /** App path that relative links resolve against, e.g. /ada/keep/blob/main */
  linkBase?: string;
  /** App path that relative images resolve against, e.g. /ada/keep/raw/main */
  rawBase?: string;
}

function resolveRelative(url: string, base: string): string | null {
  if (!url || url.startsWith("#") || url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  if (url.startsWith("mailto:") || url.startsWith("//")) return url;
  if (url.startsWith("/")) return `${base}${url}`;

  const [pathPart, suffix = ""] = url.split(/(?=[?#])/);
  if (!pathPart) return url;
  try {
    const normalized = normalizeRepoPath(pathPart.replace(/^\.\//, ""));
    return `${base}/${normalized}${suffix}`.replace(/\/+$/, "") || base;
  } catch {
    return null;
  }
}

function relativeUrlPlugin(options: MarkdownRenderOptions) {
  return () => (tree: HastNode) => {
    const walk = (node: HastNode) => {
      if (node.type === "element" && node.tagName === "a" && node.properties?.href) {
        const href = String(node.properties.href);
        const resolved = options.linkBase ? resolveRelative(href, options.linkBase) : href;
        if (resolved === null) delete node.properties.href;
        else node.properties.href = resolved;
        if (/^https?:\/\//.test(String(node.properties.href))) {
          node.properties.rel = "noopener noreferrer nofollow";
        }
      }
      if (node.type === "element" && node.tagName === "img" && node.properties?.src) {
        const src = String(node.properties.src);
        const resolved = options.rawBase ? resolveRelative(src, options.rawBase) : src;
        if (resolved === null) delete node.properties.src;
        else node.properties.src = resolved;
        node.properties.loading = "lazy";
        node.properties.alt = node.properties.alt ?? "";
      }
      node.children?.forEach(walk);
    };
    walk(tree);
  };
}

/** Bounded LRU so a busy page cannot grow memory without limit. */
const cache = new Map<string, string>();
const CACHE_LIMIT = 256;

function cacheKey(content: string, options: MarkdownRenderOptions): string {
  const hash = createHash("sha256").update(content).digest("hex");
  return `${MARKDOWN_RENDERER_VERSION}:${hash}:${options.linkBase ?? ""}:${options.rawBase ?? ""}`;
}

export async function renderMarkdown(
  content: string,
  options: MarkdownRenderOptions = {},
): Promise<string> {
  const key = cacheKey(content, options);
  const hit = cache.get(key);
  if (hit) {
    // Refresh recency.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }

  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: false })
    .use(sanitize, schema)
    // Runs after sanitisation so href/src rewriting and rel/loading attributes
    // cannot be stripped, and so only our own safe values reach the output.
    .use(relativeUrlPlugin(options))
    .use(rehypeStringify)
    .process(content);

  const html = String(file);
  cache.set(key, html);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  return html;
}

/** Test helper. */
export function clearMarkdownCache(): void {
  cache.clear();
}

/** Extracts a one-line plain-text summary for lists (no HTML injection). */
export function plainSummary(markdown: string, maxLength = 140): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}
