const USES_PATTERN = /\buses:\s*(.+)$/dg;

export function parseUsesSlug(
  lineText: string,
  position?: number,
): string | undefined {
  let match;
  while ((match = USES_PATTERN.exec(lineText)) !== null) {
    let slug = match[1].trim();

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
      continue;
    }

    // If a position is provided, check if the slug capture group contains the position
    if (typeof position === "number") {
      const indices = match.indices?.[1];
      if (!indices || position < indices[0] || position > indices[1]) {
        continue;
      }
    }

    return slug;
  }

  return undefined;
}
