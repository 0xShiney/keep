/**
 * Forgejo stores label colours as six hex digits chosen by the user. They are
 * presentation data, not design tokens, so they are normalised and rendered with
 * an alpha layer; text colour is chosen for contrast.
 */
export function badgeStyle(color: string): {
  backgroundColor: string;
  color: string;
  borderColor: string;
} {
  const normalized = /^[0-9a-fA-F]{6}$/.test(color) ? color : "888888";
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const text = luminance > 0.62 ? "#24292f" : `#${normalized}`;
  return {
    backgroundColor: `#${normalized}${luminance > 0.62 ? "33" : "1f"}`,
    borderColor: `#${normalized}55`,
    color: text,
  };
}
