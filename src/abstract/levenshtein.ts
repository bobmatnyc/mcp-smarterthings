/**
 * Levenshtein distance calculation for fuzzy string matching.
 *
 * Computes the minimum number of single-character edits (insertions,
 * deletions, substitutions) needed to transform one string into another.
 *
 * Time Complexity: O(m * n) where m and n are string lengths
 * Space Complexity: O(min(m, n)) using optimized array approach
 *
 * @module abstract/levenshtein
 */

/**
 * Calculate Levenshtein distance between two strings.
 *
 * Uses optimized space algorithm with two arrays instead of full matrix.
 *
 * @param str1 First string
 * @param str2 Second string
 * @returns Edit distance (0 = identical, higher = more different)
 *
 * @example
 * ```typescript
 * levenshteinDistance('kitten', 'sitting'); // 3
 * levenshteinDistance('hello', 'hello');    // 0
 * levenshteinDistance('book', 'back');      // 2
 * ```
 */
export function levenshteinDistance(str1: string, str2: string): number {
  // Normalize inputs
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  // Base cases
  if (s1 === s2) return 0;
  if (s1.length === 0) return s2.length;
  if (s2.length === 0) return s1.length;

  // Optimize: ensure s1 is the shorter string to minimize space
  if (s1.length > s2.length) {
    return levenshteinDistance(s2, s1);
  }

  // Only need two arrays (current row and previous row)
  const len1 = s1.length;
  const len2 = s2.length;

  let previousRow = Array.from({ length: len1 + 1 }, (_, i) => i);
  let currentRow = new Array(len1 + 1);

  // Build distance matrix row by row
  for (let i = 1; i <= len2; i++) {
    currentRow[0] = i;

    for (let j = 1; j <= len1; j++) {
      const cost = s1[j - 1] === s2[i - 1] ? 0 : 1;
      const prevValue = previousRow[j];
      const currentPrevValue = currentRow[j - 1];
      const diagValue = previousRow[j - 1];

      currentRow[j] = Math.min(
        prevValue !== undefined ? prevValue + 1 : Infinity, // deletion
        currentPrevValue !== undefined ? currentPrevValue + 1 : Infinity, // insertion
        diagValue !== undefined ? diagValue + cost : Infinity // substitution
      );
    }

    // Swap arrays (current becomes previous for next iteration)
    [previousRow, currentRow] = [currentRow, previousRow];
  }

  const result = previousRow[len1];
  return result !== undefined ? result : 0;
}

/**
 * Calculate similarity score between two strings.
 *
 * Normalized similarity score based on Levenshtein distance:
 * - 1.0 = identical strings
 * - 0.0 = completely different
 *
 * Formula: 1 - (distance / max_length)
 *
 * @param str1 First string
 * @param str2 Second string
 * @returns Similarity score between 0.0 and 1.0
 *
 * @example
 * ```typescript
 * similarityScore('kitten', 'sitting'); // 0.571 (3 edits, max length 7)
 * similarityScore('hello', 'hello');    // 1.0 (0 edits)
 * similarityScore('abc', 'xyz');        // 0.0 (3 edits, max length 3)
 * ```
 */
export function similarityScore(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  // Identical strings
  if (s1 === s2) return 1.0;

  // Empty strings
  if (s1.length === 0 || s2.length === 0) return 0.0;

  const distance = levenshteinDistance(s1, s2);
  const maxLength = Math.max(s1.length, s2.length);

  return 1 - distance / maxLength;
}

/**
 * Find the best match from a list of candidates.
 *
 * Returns the candidate with the highest similarity score above
 * the specified threshold.
 *
 * @param query Search query
 * @param candidates List of candidate strings
 * @param threshold Minimum similarity threshold (0.0-1.0, default: 0.6)
 * @returns Best matching candidate or undefined if none meet threshold
 *
 * @example
 * ```typescript
 * const devices = ['living room light', 'bedroom lamp', 'kitchen light'];
 * findBestMatch('livng room', devices);  // 'living room light'
 * findBestMatch('bathroom', devices);    // undefined (no close match)
 * ```
 */
export function findBestMatch(
  query: string,
  candidates: string[],
  threshold: number = 0.6
): string | undefined {
  let bestMatch: string | undefined;
  let bestScore = threshold;

  for (const candidate of candidates) {
    const score = similarityScore(query, candidate);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  return bestMatch;
}

/**
 * Find all matches above threshold, sorted by similarity.
 *
 * Returns candidates that meet the similarity threshold,
 * ordered from best to worst match.
 *
 * @param query Search query
 * @param candidates List of candidate strings
 * @param threshold Minimum similarity threshold (0.0-1.0, default: 0.6)
 * @param limit Maximum number of results (default: unlimited)
 * @returns Array of matches with similarity scores
 *
 * @example
 * ```typescript
 * const devices = ['living room light', 'bedroom lamp', 'kitchen light', 'living room fan'];
 * findAllMatches('living', devices, 0.5);
 * // [
 * //   { match: 'living room light', score: 0.84 },
 * //   { match: 'living room fan', score: 0.80 }
 * // ]
 * ```
 */
export function findAllMatches(
  query: string,
  candidates: string[],
  threshold: number = 0.6,
  limit?: number
): Array<{ match: string; score: number }> {
  const matches: Array<{ match: string; score: number }> = [];

  for (const candidate of candidates) {
    const score = similarityScore(query, candidate);
    if (score >= threshold) {
      matches.push({ match: candidate, score });
    }
  }

  // Sort by score (descending)
  matches.sort((a, b) => b.score - a.score);

  // Apply limit if specified
  return limit ? matches.slice(0, limit) : matches;
}
