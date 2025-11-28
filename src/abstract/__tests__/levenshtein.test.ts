/**
 * Levenshtein distance test suite.
 *
 * Tests fuzzy string matching algorithms used for device name resolution.
 */

import { describe, it, expect } from 'vitest';
import {
  levenshteinDistance,
  similarityScore,
  findBestMatch,
  findAllMatches,
} from '../levenshtein.js';

describe('levenshteinDistance', () => {
  it('should return 0 for identical strings', () => {
    expect(levenshteinDistance('hello', 'hello')).toBe(0);
    expect(levenshteinDistance('test', 'test')).toBe(0);
  });

  it('should be case-insensitive', () => {
    expect(levenshteinDistance('Hello', 'hello')).toBe(0);
    expect(levenshteinDistance('TEST', 'test')).toBe(0);
  });

  it('should ignore leading/trailing whitespace', () => {
    expect(levenshteinDistance('  hello  ', 'hello')).toBe(0);
    expect(levenshteinDistance('test', '  test  ')).toBe(0);
  });

  it('should calculate correct distance for single character difference', () => {
    expect(levenshteinDistance('hello', 'helo')).toBe(1); // deletion
    expect(levenshteinDistance('hello', 'helllo')).toBe(1); // insertion
    expect(levenshteinDistance('hello', 'hallo')).toBe(1); // substitution
  });

  it('should calculate correct distance for multiple differences', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    expect(levenshteinDistance('book', 'back')).toBe(2);
    expect(levenshteinDistance('saturday', 'sunday')).toBe(3);
  });

  it('should handle empty strings', () => {
    expect(levenshteinDistance('', '')).toBe(0);
    expect(levenshteinDistance('hello', '')).toBe(5);
    expect(levenshteinDistance('', 'world')).toBe(5);
  });

  it('should handle strings of different lengths', () => {
    expect(levenshteinDistance('a', 'abc')).toBe(2);
    expect(levenshteinDistance('abc', 'a')).toBe(2);
  });

  it('should be symmetric', () => {
    expect(levenshteinDistance('hello', 'world')).toBe(levenshteinDistance('world', 'hello'));
    expect(levenshteinDistance('test', 'temp')).toBe(levenshteinDistance('temp', 'test'));
  });
});

describe('similarityScore', () => {
  it('should return 1.0 for identical strings', () => {
    expect(similarityScore('hello', 'hello')).toBe(1.0);
    expect(similarityScore('test', 'test')).toBe(1.0);
  });

  it('should return 0.0 for completely different strings of same length', () => {
    expect(similarityScore('abc', 'xyz')).toBe(0.0);
  });

  it('should return 0.0 for empty strings', () => {
    expect(similarityScore('', 'hello')).toBe(0.0);
    expect(similarityScore('hello', '')).toBe(0.0);
  });

  it('should calculate correct similarity for partial matches', () => {
    // 'kitten' → 'sitting' = 3 edits, max length 7
    // Similarity = 1 - 3/7 ≈ 0.571
    const score = similarityScore('kitten', 'sitting');
    expect(score).toBeCloseTo(0.571, 2);
  });

  it('should calculate correct similarity for single character difference', () => {
    // 'hello' → 'hallo' = 1 edit, max length 5
    // Similarity = 1 - 1/5 = 0.8
    const score = similarityScore('hello', 'hallo');
    expect(score).toBe(0.8);
  });

  it('should be case-insensitive', () => {
    expect(similarityScore('Hello', 'hello')).toBe(1.0);
    expect(similarityScore('TEST', 'test')).toBe(1.0);
  });

  it('should be symmetric', () => {
    expect(similarityScore('hello', 'world')).toBe(similarityScore('world', 'hello'));
  });
});

describe('findBestMatch', () => {
  const candidates = ['Living Room Light', 'Bedroom Lamp', 'Kitchen Light', 'Bathroom Fan'];

  it('should find exact match', () => {
    const result = findBestMatch('Living Room Light', candidates);

    expect(result).toBe('Living Room Light');
  });

  it('should find best match with typo', () => {
    const result = findBestMatch('Livng Room Light', candidates); // Missing 'i'

    expect(result).toBe('Living Room Light');
  });

  it('should be case-insensitive', () => {
    const result = findBestMatch('LIVING ROOM LIGHT', candidates);

    expect(result).toBe('Living Room Light');
  });

  it('should return undefined when no good match exists', () => {
    const result = findBestMatch('Garage Door', candidates);

    expect(result).toBeUndefined();
  });

  it('should respect custom threshold', () => {
    const result = findBestMatch('Living', candidates, 0.9); // Very strict threshold

    // 'Living' is too short to match 'Living Room Light' at 0.9 threshold
    expect(result).toBeUndefined();
  });

  it('should handle empty candidate list', () => {
    const result = findBestMatch('test', []);

    expect(result).toBeUndefined();
  });

  it('should find closest match among similar candidates', () => {
    const similar = ['Living Room Light 1', 'Living Room Light 2', 'Living Room Light 3'];

    const result = findBestMatch('Living Room Light 2', similar);

    expect(result).toBe('Living Room Light 2');
  });
});

describe('findAllMatches', () => {
  const candidates = [
    'Living Room Light',
    'Living Room Fan',
    'Bedroom Light',
    'Kitchen Light',
    'Bathroom Fan',
  ];

  it('should find all matches above threshold', () => {
    const results = findAllMatches('Room Light', candidates, 0.5);

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.score >= 0.5)).toBe(true);
  });

  it('should sort results by score descending', () => {
    const results = findAllMatches('Living', candidates, 0.3);

    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
    }
  });

  it('should include similarity scores', () => {
    const results = findAllMatches('Living Room', candidates, 0.5);

    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(1);
    }
  });

  it('should respect limit parameter', () => {
    const results = findAllMatches('Light', candidates, 0.3, 2);

    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('should return empty array when no matches', () => {
    const results = findAllMatches('Garage', candidates, 0.9);

    expect(results).toHaveLength(0);
  });

  it('should handle empty candidate list', () => {
    const results = findAllMatches('test', [], 0.5);

    expect(results).toHaveLength(0);
  });

  it('should find multiple similar matches', () => {
    const results = findAllMatches('Living Room', candidates, 0.5);

    // Should match both 'Living Room Light' and 'Living Room Fan'
    expect(results.length).toBeGreaterThanOrEqual(2);

    const matches = results.map((r) => r.match);
    expect(matches).toContain('Living Room Light');
    expect(matches).toContain('Living Room Fan');
  });

  it('should work with very strict threshold', () => {
    const results = findAllMatches('Living Room Light', candidates, 0.95);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.match).toBe('Living Room Light');
    expect(results[0]!.score).toBeGreaterThanOrEqual(0.95);
  });
});

describe('Real-World Device Name Scenarios', () => {
  const deviceNames = [
    'Front Door Lock',
    'Back Door Lock',
    'Garage Door Opener',
    'Living Room Light',
    'Living Room Lamp',
    'Living Room Fan',
    'Master Bedroom Light',
    'Guest Bedroom Light',
    'Kitchen Overhead Light',
    'Kitchen Under-Cabinet Light',
  ];

  it('should handle common typos', () => {
    expect(findBestMatch('Livng Room Light', deviceNames)).toBe('Living Room Light');
    expect(findBestMatch('Kichen Overhead Light', deviceNames)).toBe('Kitchen Overhead Light');
    expect(findBestMatch('Garag Door Opener', deviceNames)).toBe('Garage Door Opener');
  });

  it('should handle partial names', () => {
    const results = findAllMatches('Living Room', deviceNames, 0.5);

    expect(results.length).toBeGreaterThanOrEqual(3);
    const matches = results.map((r) => r.match);
    expect(matches).toContain('Living Room Light');
    expect(matches).toContain('Living Room Lamp');
    expect(matches).toContain('Living Room Fan');
  });

  it('should distinguish between similar names', () => {
    const front = findBestMatch('Front Door', deviceNames);
    const back = findBestMatch('Back Door', deviceNames);

    expect(front).toBe('Front Door Lock');
    expect(back).toBe('Back Door Lock');
    expect(front).not.toBe(back);
  });

  it('should handle abbreviated queries', () => {
    const results = findAllMatches('BR Light', deviceNames, 0.4);

    // Should find bedroom lights
    expect(results.length).toBeGreaterThan(0);
  });

  it('should handle compound names', () => {
    const result = findBestMatch('Kitchen Under-Cabnet Light', deviceNames, 0.6);

    expect(result).toBe('Kitchen Under-Cabinet Light');
  });

  it('should handle case variations', () => {
    expect(findBestMatch('LIVING ROOM LIGHT', deviceNames)).toBe('Living Room Light');
    expect(findBestMatch('living room light', deviceNames)).toBe('Living Room Light');
    expect(findBestMatch('LiViNg RoOm LiGhT', deviceNames)).toBe('Living Room Light');
  });
});
