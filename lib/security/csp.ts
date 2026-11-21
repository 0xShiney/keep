/**
 * Content-Security-Policy assembly, kept in its own module so the policy can be
 * unit tested and so the one accepted weakness (inline styles) is visible and
 * owned. See docs/DECISIONS.md D-011 for the rationale and removal plan.
 */

/**
 * Radix primitives and Next.js inject inline `style` attributes (positioning,
 * transform-origin, focus guards). CSP style attributes cannot carry a nonce, so
 * the only way to keep the primitives working is to allow inline styles.
 *
 * This is the single documented exception in the policy. Removing it requires
 * the steps in D-011; tests fail if the directive disappears without the
 * decision being updated (tests/unit/csp.test.ts).
 */
export const STYLE_SRC = "style-src 'self' 'unsafe-inline'";

export function buildCsp(nonce: string, isDev: boolean): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    STYLE_SRC,
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
  ];

  if (!isDev) directives.push("upgrade-insecure-requests");

  return directives.join("; ");
}
