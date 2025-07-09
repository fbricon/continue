const USES_PATTERN = /^\s*#?\s*-\s*uses:\s*(.+)$/;

export function parseUsesSlug(
  lineText: string,
  position?: number,
): string | undefined {
  const match = USES_PATTERN.exec(lineText);
  if (!match) {
    return undefined;
  }
  let slug = match[1].trim();
  // Remove any leading comment symbols (#)
  slug = slug.replace(/^\s*(#\s*)+/, "");

  // Check for surrounding quotes
  const quoteMatch = slug.match(/^(['"])(.*)\1/);
  if (quoteMatch) {
    // If quoted, remove the quotes but keep everything inside (including #)
    slug = quoteMatch[2].trim();
  } else {
    // If not quoted, remove any trailing comment
    slug = slug.replace(/\s*#.*$/, "").trim();
  }

  if (!slug || !slug.startsWith("$")) {
    return undefined;
  }

  // If a position is provided, check if the slug is within the line text at that position
  if (typeof position === "number") {
    const startPos = lineText.indexOf(slug);
    const endPos = startPos + slug.length;
    if (position < startPos || position > endPos) {
      return undefined;
    }
  }

  return slug;
}
