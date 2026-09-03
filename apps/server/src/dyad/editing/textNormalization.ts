// FILE: textNormalization.ts
// Purpose: Unicode normalization for fuzzy line comparison.
// Donor: dyad x caide src/utils/text_normalization.ts (verbatim).

/**
 * Normalizes text for comparison by handling smart quotes and other special characters
 */
export function normalizeString(text: string): string {
  return (
    text
      // Normalize smart quotes to regular quotes
      .replace(/[‘’]/g, "'") // Single quotes
      .replace(/[“”]/g, '"') // Double quotes
      // Normalize different types of dashes
      .replace(/[–—]/g, "-") // En dash and em dash to hyphen
      // Normalize ellipsis
      .replace(/…/g, "...") // Ellipsis to three dots
      // Normalize non-breaking spaces
      .replace(/ /g, " ") // Non-breaking space to regular space
      // Normalize other common Unicode variants
      .replace(/­/g, "") // Soft hyphen (remove)
      .replace(/[﻿]/g, "")
  ); // Zero-width no-break space (remove)
}
