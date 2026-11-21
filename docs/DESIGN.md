# Design system

Source of truth: `app/globals.css` (tokens) and `components/ui/` (primitives).
Components use semantic utilities only — no raw colours.

## Principles

Dense, calm, dark-first. Borders do the structural work; shadows appear only on
popovers and dialogs. Every state (loading, empty, error) is designed, not
improvised. Motion is ≤150 ms and disabled under `prefers-reduced-motion`.

## Tokens (OKLCH, CSS variables)

| Group    | Variables                                                              |
| -------- | ---------------------------------------------------------------------- |
| Surfaces | `--bg`, `--surface-1`, `--surface-2`, `--surface-3`, `--overlay`       |
| Text     | `--fg`, `--fg-muted`, `--fg-subtle`                                    |
| Borders  | `--border`, `--border-strong`, `--ring`                                |
| Accent   | `--accent`, `--accent-fg`, `--accent-subtle`                           |
| Semantic | `success`, `warning`, `danger`, `info` + `-subtle` variants            |
| Diff     | `--diff-add-bg`, `--diff-del-bg`, `--diff-add-word`, `--diff-del-word` |

Exposed to Tailwind v4 through `@theme inline` so `bg-surface-1`, `text-fg-muted`,
`border-border` and friends are the only way to style surfaces. Light mode is
derived from the same variables; the theme is resolved **server-side** from the
`keep_theme` cookie and written to `<html data-theme>` so Shiki output, CSS and
the toggle never disagree.

## Scale

- Spacing: 4 px base (`gap-1` = 4 px … `gap-6` = 24 px). Compact density default.
- Radii: 4 px (`rounded-sm`), 6 px (`rounded-md`), 8 px (`rounded-lg`).
- Type: 12/13/14/16/20/24/30 px; UI font Geist Sans, code Geist Mono / JetBrains
  Mono fallback.
- Icons: lucide at 16 px inline, 20 px in empty states.
- Focus: 2 px ring with offset on every interactive element, never removed.

## Shell

Top bar with repo switcher, command palette trigger (`⌘K` / `Ctrl+K`), user menu and
theme toggle. Repository pages add a repo header (name, visibility, actions) and a
tab bar (Code, Commits, Branches, Tags, Issues, Pulls, Releases, Insights,
Settings). Below 1024 px the header collapses; below 640 px everything is a single
column and diffs default to unified.

## Components

Primitives: `Button` (primary/secondary/ghost/danger, sm/md/icon), `Badge` (tone
variants incl. visibility), `Input`, `Panel` (header/body), `Skeleton`,
`EmptyState`, `InlineNotice`, `PageHeader`, `Pagination`.

Domain: repo header, clone panel, ref switcher, file table, breadcrumbs, commit
list, diff view (unified/split, per-file `<details>`, lazy budget), code viewer,
markdown view, avatar, labels, issue/PR forms, account forms.

## Keyboard model

| Key             | Action                 |
| --------------- | ---------------------- |
| `⌘K` / `Ctrl+K` | Command palette        |
| `g d`           | Dashboard              |
| `g c`           | Code (repo tree)       |
| `g i`           | Issues                 |
| `g p`           | Pull requests          |
| `t`             | Focus the ref switcher |
| `/`             | Focus search           |
| `?`             | Shortcut help          |

Shortcuts are ignored while typing in inputs, textareas or contenteditable.

## Page states

Every route ships `loading.tsx` (skeleton matching final layout, no shift),
`not-found.tsx`, and an inline error panel with a request id and retry. Empty
states explain the next action (e.g. “Create the first issue”), never just “No data”.

## Diffs

- Unified by default; split when the viewport allows.
- Per-file collapsible sections; the server sends a bounded diff and the client
  opens only the first files within a 3,500-line budget.
- Word-level highlights for changed lines, from `lib/git/word-diff.ts`.
- Files with binary content say so; capped files offer “load this file’s diff”.

## Accessibility

WCAG 2.2 AA target: semantic landmarks, labelled controls, visible focus, 4.5:1
contrast for text, no colour-only status, `aria-current` on navigation, dialogs
with titles and focus traps (Radix), and a skip link. `tests/e2e/a11y.spec.ts`
runs axe in both themes; results are **not yet recorded** (needs a live stack).
