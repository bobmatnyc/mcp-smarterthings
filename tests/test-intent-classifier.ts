#!/usr/bin/env tsx

/**
 * IntentClassifier Test Suite - Phase 3 Testing
 *
 * Tests the IntentClassifier service with real queries to validate:
 * 1. Classification accuracy (target: >90%)
 * 2. Performance metrics (cache, keyword, LLM latencies)
 * 3. Entity extraction (device names, rooms, timeframes)
 * 4. Confidence scoring (0-1 scale)
 * 5. Cache hit rate on second run (target: >70%)
 *
 * READ-ONLY TESTING: No device operations or state changes
 */

import dotenv from 'dotenv';
import { IntentClassifier, DiagnosticIntent } from './src/services/IntentClassifier.js';
import { LlmService } from './src/services/llm.js';

// Load environment variables
dotenv.config();

/**
 * Test case structure
 */
interface TestCase {
  query: string;
  expected: DiagnosticIntent;
  description?: string;
}

/**
 * Test results structure
 */
interface TestResult {
  query: string;
  expected: DiagnosticIntent;
  actual: DiagnosticIntent;
  confidence: number;
  latency: number;
  entities: any;
  match: boolean;
  method?: 'cache' | 'keyword' | 'llm';
}

/**
 * Performance metrics structure
 */
interface PerformanceMetrics {
  cacheHits: number;
  keywordMatches: number;
  llmCalls: number;
  avgCacheLatency: number;
  avgKeywordLatency: number;
  avgLlmLatency: number;
  cacheHitRate: number;
}

/**
 * Test queries from design spec
 */
const testQueries: TestCase[] = [
  // ISSUE_DIAGNOSIS
  {
    query: "Why isn't my bedroom light turning on?",
    expected: DiagnosticIntent.ISSUE_DIAGNOSIS,
    description: "Standard issue diagnosis with device reference"
  },
  {
    query: "my master bedroom alcove light just came on (i turned off) see if it can figure out why",
    expected: DiagnosticIntent.ISSUE_DIAGNOSIS,
    description: "Real-world query from user investigation"
  },
  {
    query: "my motion sensor stopped working",
    expected: DiagnosticIntent.ISSUE_DIAGNOSIS,
    description: "Issue diagnosis with device malfunction"
  },

  // DISCOVERY
  {
    query: "Show me all motion sensors",
    expected: DiagnosticIntent.DISCOVERY,
    description: "Discovery with device type filter"
  },
  {
    query: "find devices similar to bedroom motion sensor",
    expected: DiagnosticIntent.DISCOVERY,
    description: "Discovery with similarity search"
  },

  // DEVICE_HEALTH
  {
    query: "What's the status of my thermostat?",
    expected: DiagnosticIntent.DEVICE_HEALTH,
    description: "Health check with specific device"
  },
  {
    query: "check my motion sensor",
    expected: DiagnosticIntent.DEVICE_HEALTH,
    description: "Simple health check"
  },

  // NORMAL_QUERY
  {
    query: "Turn off the lights",
    expected: DiagnosticIntent.NORMAL_QUERY,
    description: "Normal device control command"
  },

  // MODE_MANAGEMENT
  {
    query: "enter troubleshooting mode",
    expected: DiagnosticIntent.MODE_MANAGEMENT,
    description: "Mode management command"
  },

  // SYSTEM_STATUS
  {
    query: "How is my system doing?",
    expected: DiagnosticIntent.SYSTEM_STATUS,
    description: "System-wide status check"
  },
  {
    query: "show me system status",
    expected: DiagnosticIntent.SYSTEM_STATUS,
    description: "Direct system status request"
  }
];

/**
 * Main test execution
 */
async function runTests() {
  console.log('='.repeat(80));
  console.log('IntentClassifier Test Suite - Phase 3');
  console.log('='.repeat(80));
  console.log();

  // Initialize services
  console.log('Initializing services...');
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY not found in environment');
  }

  const llmService = new LlmService({ apiKey });
  const classifier = new IntentClassifier(llmService);
  console.log('✅ Services initialized');
  console.log();

  // First run: Test classification accuracy
  console.log('='.repeat(80));
  console.log('FIRST RUN: Classification Accuracy Test');
  console.log('='.repeat(80));
  console.log();

  const firstRunResults: TestResult[] = [];
  const latencyByMethod = {
    cache: [] as number[],
    keyword: [] as number[],
    llm: [] as number[]
  };

  for (let i = 0; i < testQueries.length; i++) {
    const test = testQueries[i];
    console.log(`Test ${i + 1}/${testQueries.length}: ${test.description}`);
    console.log(`Query: "${test.query}"`);

    const startTime = Date.now();
    const result = await classifier.classifyIntent(test.query);
    const latency = Date.now() - startTime;

    // Determine method based on latency (approximation)
    let method: 'cache' | 'keyword' | 'llm';
    if (latency < 5) {
      method = 'cache';
      latencyByMethod.cache.push(latency);
    } else if (latency < 20) {
      method = 'keyword';
      latencyByMethod.keyword.push(latency);
    } else {
      method = 'llm';
      latencyByMethod.llm.push(latency);
    }

    const match = result.intent === test.expected;

    firstRunResults.push({
      query: test.query,
      expected: test.expected,
      actual: result.intent,
      confidence: result.confidence,
      latency,
      entities: result.entities,
      match,
      method
    });

    console.log(`Expected: ${test.expected}`);
    console.log(`Actual:   ${result.intent}`);
    console.log(`Match:    ${match ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    console.log(`Latency: ${latency}ms (${method})`);
    console.log(`Entities: ${JSON.stringify(result.entities, null, 2)}`);
    console.log('-'.repeat(80));
    console.log();
  }

  // Calculate accuracy
  const correctCount = firstRunResults.filter(r => r.match).length;
  const accuracy = (correctCount / firstRunResults.length) * 100;

  console.log('='.repeat(80));
  console.log('FIRST RUN RESULTS');
  console.log('='.repeat(80));
  console.log();
  console.log(`Total Queries: ${firstRunResults.length}`);
  console.log(`Correct: ${correctCount}`);
  console.log(`Incorrect: ${firstRunResults.length - correctCount}`);
  console.log(`Accuracy: ${accuracy.toFixed(1)}% (Target: >90%)`);
  console.log();

  // Show failures
  const failures = firstRunResults.filter(r => !r.match);
  if (failures.length > 0) {
    console.log('Failed Classifications:');
    failures.forEach(f => {
      console.log(`  ❌ "${f.query}"`);
      console.log(`     Expected: ${f.expected}, Got: ${f.actual}`);
    });
    console.log();
  }

  // Performance metrics for first run
  console.log('Performance Metrics (First Run):');
  console.log(`  Cache hits: ${latencyByMethod.cache.length}`);
  console.log(`  Keyword matches: ${latencyByMethod.keyword.length}`);
  console.log(`  LLM calls: ${latencyByMethod.llm.length}`);

  if (latencyByMethod.cache.length > 0) {
    const avgCache = latencyByMethod.cache.reduce((a, b) => a + b, 0) / latencyByMethod.cache.length;
    console.log(`  Avg cache latency: ${avgCache.toFixed(2)}ms (Target: <5ms)`);
  }

  if (latencyByMethod.keyword.length > 0) {
    const avgKeyword = latencyByMethod.keyword.reduce((a, b) => a + b, 0) / latencyByMethod.keyword.length;
    console.log(`  Avg keyword latency: ${avgKeyword.toFixed(2)}ms (Target: <10ms)`);
  }

  if (latencyByMethod.llm.length > 0) {
    const avgLlm = latencyByMethod.llm.reduce((a, b) => a + b, 0) / latencyByMethod.llm.length;
    console.log(`  Avg LLM latency: ${avgLlm.toFixed(2)}ms (Target: <300ms)`);
  }
  console.log();

  // Second run: Test cache hit rate
  console.log('='.repeat(80));
  console.log('SECOND RUN: Cache Hit Rate Test');
  console.log('='.repeat(80));
  console.log();

  const secondRunResults: TestResult[] = [];
  let cacheHits = 0;

  for (let i = 0; i < testQueries.length; i++) {
    const test = testQueries[i];

    const startTime = Date.now();
    const result = await classifier.classifyIntent(test.query);
    const latency = Date.now() - startTime;

    // Cache hit if latency < 5ms
    const isCacheHit = latency < 5;
    if (isCacheHit) {
      cacheHits++;
    }

    secondRunResults.push({
      query: test.query,
      expected: test.expected,
      actual: result.intent,
      confidence: result.confidence,
      latency,
      entities: result.entities,
      match: result.intent === test.expected,
      method: isCacheHit ? 'cache' : 'keyword'
    });

    console.log(`Test ${i + 1}/${testQueries.length}: "${test.query.substring(0, 50)}..."`);
    console.log(`  Latency: ${latency}ms ${isCacheHit ? '✅ CACHED' : '⚠️  NOT CACHED'}`);
  }

  const cacheHitRate = (cacheHits / testQueries.length) * 100;

  console.log();
  console.log('='.repeat(80));
  console.log('SECOND RUN RESULTS');
  console.log('='.repeat(80));
  console.log();
  console.log(`Total Queries: ${testQueries.length}`);
  console.log(`Cache Hits: ${cacheHits}`);
  console.log(`Cache Misses: ${testQueries.length - cacheHits}`);
  console.log(`Cache Hit Rate: ${cacheHitRate.toFixed(1)}% (Target: >70%)`);
  console.log();

  // Get cache stats from classifier
  const cacheStats = classifier.getCacheStats();
  console.log('Cache Statistics:');
  console.log(`  Total hits: ${cacheStats.hits}`);
  console.log(`  Total misses: ${cacheStats.misses}`);
  console.log(`  Overall hit rate: ${(cacheStats.hitRate * 100).toFixed(1)}%`);
  console.log(`  Cache size: ${cacheStats.size} entries`);
  console.log();

  // Entity extraction analysis
  console.log('='.repeat(80));
  console.log('ENTITY EXTRACTION ANALYSIS');
  console.log('='.repeat(80));
  console.log();

  const entityTests = firstRunResults.filter(r =>
    r.entities.deviceName || r.entities.roomName || r.entities.timeframe || r.entities.issueType
  );

  console.log(`Queries with extracted entities: ${entityTests.length}/${firstRunResults.length}`);
  console.log();

  entityTests.forEach(test => {
    console.log(`Query: "${test.query}"`);
    if (test.entities.deviceName) {
      console.log(`  Device: "${test.entities.deviceName}"`);
    }
    if (test.entities.roomName) {
      console.log(`  Room: "${test.entities.roomName}"`);
    }
    if (test.entities.timeframe) {
      console.log(`  Timeframe: "${test.entities.timeframe}"`);
    }
    if (test.entities.issueType) {
      console.log(`  Issue Type: "${test.entities.issueType}"`);
    }
    console.log();
  });

  // Confidence score analysis
  console.log('='.repeat(80));
  console.log('CONFIDENCE SCORE ANALYSIS');
  console.log('='.repeat(80));
  console.log();

  const highConfidence = firstRunResults.filter(r => r.confidence > 0.85);
  const mediumConfidence = firstRunResults.filter(r => r.confidence >= 0.7 && r.confidence <= 0.85);
  const lowConfidence = firstRunResults.filter(r => r.confidence < 0.7);

  console.log(`High confidence (>0.85): ${highConfidence.length} queries`);
  console.log(`Medium confidence (0.7-0.85): ${mediumConfidence.length} queries`);
  console.log(`Low confidence (<0.7): ${lowConfidence.length} queries`);
  console.log();

  if (lowConfidence.length > 0) {
    console.log('Low confidence queries:');
    lowConfidence.forEach(r => {
      console.log(`  "${r.query}"`);
      console.log(`    Intent: ${r.actual}, Confidence: ${(r.confidence * 100).toFixed(1)}%`);
    });
    console.log();
  }

  // Final summary
  console.log('='.repeat(80));
  console.log('TEST SUMMARY');
  console.log('='.repeat(80));
  console.log();
  console.log('✅ SUCCESS CRITERIA:');
  console.log(`  Classification accuracy: ${accuracy.toFixed(1)}% ${accuracy >= 90 ? '✅ PASS' : '❌ FAIL'} (Target: >90%)`);
  console.log(`  Cache hit rate: ${cacheHitRate.toFixed(1)}% ${cacheHitRate >= 70 ? '✅ PASS' : '❌ FAIL'} (Target: >70%)`);

  if (latencyByMethod.keyword.length > 0) {
    const avgKeyword = latencyByMethod.keyword.reduce((a, b) => a + b, 0) / latencyByMethod.keyword.length;
    console.log(`  Keyword latency: ${avgKeyword.toFixed(2)}ms ${avgKeyword < 10 ? '✅ PASS' : '❌ FAIL'} (Target: <10ms)`);
  }

  if (latencyByMethod.llm.length > 0) {
    const avgLlm = latencyByMethod.llm.reduce((a, b) => a + b, 0) / latencyByMethod.llm.length;
    console.log(`  LLM latency: ${avgLlm.toFixed(2)}ms ${avgLlm < 300 ? '✅ PASS' : '❌ FAIL'} (Target: <300ms)`);
  }

  console.log();
  console.log('📊 TEST RESULTS:');
  console.log(`  Total queries tested: ${testQueries.length}`);
  console.log(`  Correct classifications: ${correctCount}/${firstRunResults.length}`);
  console.log(`  Entity extraction: ${entityTests.length} queries with entities`);
  console.log(`  High confidence results: ${highConfidence.length}/${firstRunResults.length}`);
  console.log();

  // Real-world query validation
  const realWorldQuery = firstRunResults.find(r =>
    r.query.includes("master bedroom alcove light")
  );

  if (realWorldQuery) {
    console.log('🔍 REAL-WORLD QUERY VALIDATION:');
    console.log(`  Query: "${realWorldQuery.query}"`);
    console.log(`  Expected: ${realWorldQuery.expected}`);
    console.log(`  Actual: ${realWorldQuery.actual}`);
    console.log(`  Match: ${realWorldQuery.match ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  Device extracted: ${realWorldQuery.entities.deviceName || 'none'}`);
    console.log();
  }

  const allTestsPassed =
    accuracy >= 90 &&
    cacheHitRate >= 70 &&
    (latencyByMethod.llm.length === 0 ||
     latencyByMethod.llm.reduce((a, b) => a + b, 0) / latencyByMethod.llm.length < 300);

  if (allTestsPassed) {
    console.log('🎉 ALL TESTS PASSED!');
  } else {
    console.log('⚠️  SOME TESTS FAILED - Review results above');
  }

  console.log('='.repeat(80));
}

// Run tests
runTests().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});
