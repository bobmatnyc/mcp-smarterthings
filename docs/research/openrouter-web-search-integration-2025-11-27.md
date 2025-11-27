# OpenRouter Web Search Integration Research

**Date:** November 27, 2025
**Ticket:** 1M-274 - Implement AI-powered troubleshooting mode
**Phase:** 2 - Web Search Integration
**Status:** Research Complete ✅

---

## Executive Summary

**✅ CONFIRMED:** OpenRouter fully supports web search capabilities as of 2024-2025.

**Key Findings:**
- Native web search support via `:online` model suffix or explicit plugin configuration
- Standardized citation format across all models
- Multiple search engines available (native for supported providers, Exa for others)
- Minimal code changes required for integration
- Additional costs apply (~$0.02/search for Exa, provider-specific for native)

**Recommendation:** Proceed with OpenRouter web search integration for troubleshooting mode.

---

## 1. Web Search Capability Status

### ✅ Fully Supported

OpenRouter provides web search capabilities through two mechanisms:

1. **`:online` Model Suffix** (Simplest)
   - Append `:online` to any model slug
   - Example: `anthropic/claude-sonnet-4.5:online`
   - Automatically enables web search with default settings

2. **Explicit Plugin Configuration** (Advanced)
   - Use `plugins` array in API request
   - Provides granular control over search parameters
   - Example: `{ "plugins": [{ "id": "web", "engine": "native", "max_results": 3 }] }`

### Model Support Matrix

| Provider | Native Search | Fallback (Exa) | Notes |
|----------|--------------|----------------|-------|
| OpenAI | ✅ Native | N/A | Built-in web tool |
| Anthropic (Claude) | ✅ Native | N/A | Built-in search |
| Perplexity | ✅ Native | N/A | Specialized search models |
| xAI | ✅ Native | N/A | Native support |
| All Others | ❌ | ✅ Exa Search | Google, Meta, etc. |

**Current Project Model:** `anthropic/claude-sonnet-4.5`
- **Native Search Support:** ✅ YES
- **Engine:** Anthropic native search
- **Cost:** Anthropic-specific pricing (included in token costs)

---

## 2. API Integration Details

### Method 1: `:online` Suffix (Recommended for Initial Implementation)

**Pros:**
- Minimal code changes (single line)
- No additional configuration needed
- Default settings optimized for general use

**Cons:**
- Less control over search parameters
- Default 5 results may be excessive for some queries

**Implementation:**
```typescript
// Current implementation (src/services/llm.ts:140)
this.model = config.model ?? 'anthropic/claude-sonnet-4.5';

// Updated for web search
this.model = config.model ?? 'anthropic/claude-sonnet-4.5:online';
```

### Method 2: Plugin Configuration (Recommended for Production)

**Pros:**
- Fine-grained control over search behavior
- Can customize per request (troubleshooting vs. normal chat)
- Better cost optimization (limit results)
- Can specify search context size

**Cons:**
- More complex implementation
- Requires additional configuration options

**Implementation:**
```typescript
// Add to chat() method in src/services/llm.ts
async chat(
  messages: ChatMessage[],
  tools: McpToolDefinition[],
  options?: { enableWebSearch?: boolean; searchConfig?: WebSearchConfig }
): Promise<LlmResponse> {
  const requestParams: any = {
    model: this.model,
    messages,
    tools: openaiTools.length > 0 ? openaiTools : undefined,
    temperature: 0.7,
    max_tokens: 2000,
  };

  // Add web search if enabled
  if (options?.enableWebSearch) {
    requestParams.plugins = [{
      id: 'web',
      engine: 'native', // Use Anthropic's native search
      max_results: options.searchConfig?.maxResults ?? 3,
      search_prompt: options.searchConfig?.searchPrompt,
    }];

    // Optional: Control search context size
    if (options.searchConfig?.contextSize) {
      requestParams.web_search_options = {
        search_context_size: options.searchConfig.contextSize, // 'low' | 'medium' | 'high'
      };
    }
  }

  const response = await this.client.chat.completions.create(requestParams);
  // ... rest of implementation
}
```

### Web Search Configuration Interface

```typescript
/**
 * Web search configuration for LLM requests.
 */
export interface WebSearchConfig {
  /**
   * Maximum number of search results to include.
   * Default: 3 (balance between context and cost)
   * Range: 1-10 (higher = more cost)
   */
  maxResults?: number;

  /**
   * Custom search prompt to guide search query generation.
   * Example: "Focus on recent smart home device issues and solutions"
   */
  searchPrompt?: string;

  /**
   * Search engine to use.
   * - 'native': Provider's built-in search (Anthropic, OpenAI, etc.)
   * - 'exa': Exa search engine (fallback for unsupported providers)
   * - undefined: Auto-select based on provider
   */
  engine?: 'native' | 'exa';

  /**
   * Search context size (affects depth of search).
   * - 'low': Fast, minimal context
   * - 'medium': Balanced (default)
   * - 'high': Deep search, more results
   */
  contextSize?: 'low' | 'medium' | 'high';
}
```

---

## 3. Response Format with Citations

### Standardized Citation Schema

OpenRouter returns citations using OpenAI's standardized annotation format:

```typescript
/**
 * Citation annotation in LLM response.
 */
export interface UrlCitation {
  type: 'url_citation';
  url_citation: {
    /**
     * Full URL of the source.
     */
    url: string;

    /**
     * Title of the source page.
     */
    title: string;

    /**
     * Excerpt from the source (search result snippet).
     */
    content: string;

    /**
     * Character index where citation starts in response text.
     */
    start_index: number;

    /**
     * Character index where citation ends in response text.
     */
    end_index: number;
  };
}

/**
 * Extended LLM response with web search citations.
 */
export interface LlmResponseWithCitations extends LlmResponse {
  /**
   * Citation annotations from web search results.
   */
  citations?: UrlCitation[];
}
```

### Example Response

```json
{
  "content": "SmartThings devices experiencing random activations can be caused by several factors[1]. Check your automation rules and routines for triggers that might not be obvious[2].",
  "citations": [
    {
      "type": "url_citation",
      "url_citation": {
        "url": "https://community.smartthings.com/t/device-turning-on-randomly/123456",
        "title": "Device Turning On Randomly - SmartThings Community",
        "content": "Random device activations are often caused by...",
        "start_index": 75,
        "end_index": 125
      }
    },
    {
      "type": "url_citation",
      "url_citation": {
        "url": "https://support.smartthings.com/troubleshooting",
        "title": "Troubleshooting Automation Issues | SmartThings Support",
        "content": "To diagnose automation problems, review your routines...",
        "start_index": 126,
        "end_index": 200
      }
    }
  ],
  "toolCalls": [],
  "finished": true,
  "usage": {
    "promptTokens": 1200,
    "completionTokens": 350,
    "totalTokens": 1550
  }
}
```

### Citation Format in Response Text

OpenRouter instructs models to cite sources using markdown links named with the source domain:

```
SmartThings devices experiencing random activations can be caused by
several factors ([community.smartthings.com](https://community.smartthings.com/...)).
Check your automation rules and routines
([support.smartthings.com](https://support.smartthings.com/...)).
```

---

## 4. Cost Implications

### Exa Search Pricing (Non-Native Models)

- **Base Cost:** $4 per 1,000 search results
- **Default Configuration:** 5 results per search
- **Cost per Search:** $0.02 (plus LLM token costs)

**Example Monthly Costs:**
- 10 troubleshooting sessions/day × 30 days × 2 searches/session = 600 searches
- 600 searches × $0.02 = $12/month (search only)
- Plus: LLM token costs (~$10-30/month for Claude Sonnet 4.5)

### Native Search Pricing (Claude, OpenAI, Perplexity, xAI)

- **Pricing:** Provider-specific, typically included in token costs
- **Claude Sonnet 4.5:** Web search context included in token pricing
- **Cost Model:** Pay for tokens consumed by search results in context
- **Optimization:** Use `search_context_size: 'low'` for cost efficiency

**Anthropic Claude Sonnet 4.5 (Current Model):**
- Input tokens: ~$0.003/1K tokens
- Output tokens: ~$0.015/1K tokens
- Web search: Context tokens billed as input tokens
- **Estimated:** 3 search results ≈ 1,500-2,000 input tokens ≈ $0.004-0.006/search

### Cost Optimization Strategies

1. **Limit Search Results:** Use `max_results: 3` instead of default 5
2. **Conditional Search:** Only enable for troubleshooting mode, not general chat
3. **Context Size Control:** Use `search_context_size: 'low'` for simple queries
4. **Caching:** Cache common troubleshooting solutions (future enhancement)
5. **Smart Triggering:** Detect when web search is actually needed

---

## 5. Integration Architecture

### Current LLM Service Architecture

```
ChatOrchestrator
    ↓
LlmService (OpenRouter)
    ↓
Claude Sonnet 4.5 API
```

### Enhanced Architecture with Web Search

```
ChatOrchestrator
    ↓
    ├─ Normal Chat Mode → LlmService.chat(messages, tools)
    │                       ↓
    │                   Claude Sonnet 4.5 (no web search)
    │
    └─ Troubleshooting Mode → LlmService.chat(messages, tools, { enableWebSearch: true })
                                 ↓
                             Claude Sonnet 4.5:online (with web search)
                                 ↓
                             Anthropic Native Search
                                 ↓
                             Search Results → Context
```

### Mode Detection Strategy

**When to Enable Web Search:**

1. **User Explicitly Requests Troubleshooting:**
   - "troubleshoot my light issue"
   - "diagnose why my routine isn't working"
   - "help me fix..."

2. **System Detects Troubleshooting Indicators:**
   - User reports unexpected device behavior
   - Event history shows anomalies (gaps, unexpected patterns)
   - Device connectivity issues detected
   - Automation failures

3. **LLM Determines Additional Context Needed:**
   - LLM can request web search via tool call
   - System prompts guide LLM to identify when external knowledge is helpful

**When to Skip Web Search:**

- Simple device control ("turn on living room light")
- Status queries ("what's the temperature?")
- Configuration changes (non-troubleshooting)
- Information already in context (event history sufficient)

---

## 6. Implementation Plan

### Phase 2a: Basic Web Search Integration (Current Task)

**Scope:** Enable web search for LLM service

**Tasks:**
1. ✅ Research OpenRouter web search capabilities (COMPLETE)
2. ⏳ Add `WebSearchConfig` interface to LLM service types
3. ⏳ Extend `chat()` method to accept web search options
4. ⏳ Add citation extraction to `LlmResponse` interface
5. ⏳ Update LLM service to parse and return citations
6. ⏳ Write unit tests for web search functionality
7. ⏳ Document web search usage patterns

**Estimated Effort:** 4-6 hours

### Phase 2b: Troubleshooting Mode Implementation

**Scope:** Create troubleshooting workflow in ChatOrchestrator

**Tasks:**
1. ⏳ Design troubleshooting system prompts
2. ⏳ Implement mode detection logic
3. ⏳ Create troubleshooting orchestration flow
4. ⏳ Integrate event history analysis with web search
5. ⏳ Add citation display in chat responses
6. ⏳ Write integration tests
7. ⏳ Document troubleshooting mode usage

**Estimated Effort:** 8-12 hours

### Phase 2c: Optimization & Refinement

**Scope:** Cost optimization and UX improvements

**Tasks:**
1. ⏳ Implement search result caching
2. ⏳ Add smart search triggering (only when needed)
3. ⏳ Optimize search parameters per query type
4. ⏳ Add usage analytics and cost tracking
5. ⏳ User testing and feedback collection

**Estimated Effort:** 6-8 hours

---

## 7. Technical Specifications for Implementation

### LLM Service Changes

**File:** `src/services/llm.ts`

**Additions Required:**

1. **Type Definitions:**
```typescript
export interface WebSearchConfig {
  maxResults?: number;
  searchPrompt?: string;
  engine?: 'native' | 'exa';
  contextSize?: 'low' | 'medium' | 'high';
}

export interface UrlCitation {
  type: 'url_citation';
  url_citation: {
    url: string;
    title: string;
    content: string;
    start_index: number;
    end_index: number;
  };
}

export interface LlmResponseWithCitations extends LlmResponse {
  citations?: UrlCitation[];
}
```

2. **Method Signature Update:**
```typescript
async chat(
  messages: ChatMessage[],
  tools: McpToolDefinition[],
  options?: { enableWebSearch?: boolean; searchConfig?: WebSearchConfig }
): Promise<LlmResponseWithCitations>
```

3. **Request Configuration:**
```typescript
// In chat() method, before API call
if (options?.enableWebSearch) {
  requestParams.plugins = [{
    id: 'web',
    engine: options.searchConfig?.engine ?? 'native',
    max_results: options.searchConfig?.maxResults ?? 3,
    search_prompt: options.searchConfig?.searchPrompt,
  }];

  if (options.searchConfig?.contextSize) {
    requestParams.web_search_options = {
      search_context_size: options.searchConfig.contextSize,
    };
  }
}
```

4. **Citation Extraction:**
```typescript
// After receiving response
const citations: UrlCitation[] = [];
if (response.choices[0]?.message.annotations) {
  for (const annotation of response.choices[0].message.annotations) {
    if (annotation.type === 'url_citation') {
      citations.push(annotation as UrlCitation);
    }
  }
}

return {
  ...llmResponse,
  citations: citations.length > 0 ? citations : undefined,
};
```

### Configuration Updates

**File:** `.env` or environment configuration

```bash
# Optional: Override default web search settings
OPENROUTER_WEB_SEARCH_ENABLED=true
OPENROUTER_WEB_SEARCH_MAX_RESULTS=3
OPENROUTER_WEB_SEARCH_CONTEXT_SIZE=medium
```

### ChatOrchestrator Integration

**File:** `src/services/chatOrchestrator.ts` (future implementation)

```typescript
// Detect troubleshooting mode
const isTroubleshooting = this.detectTroubleshootingIntent(userMessage);

// Configure LLM call
const llmOptions = isTroubleshooting ? {
  enableWebSearch: true,
  searchConfig: {
    maxResults: 3,
    searchPrompt: 'Find recent solutions for smart home device issues and SmartThings troubleshooting',
    contextSize: 'medium',
  },
} : undefined;

// Call LLM with appropriate configuration
const response = await this.llmService.chat(messages, tools, llmOptions);

// Display citations in response if present
if (response.citations) {
  this.formatResponseWithCitations(response);
}
```

---

## 8. Testing Strategy

### Unit Tests for LLM Service

**File:** `src/services/__tests__/llm-web-search.test.ts`

**Test Cases:**
1. Web search enabled via `:online` suffix
2. Web search enabled via plugin configuration
3. Custom search parameters applied correctly
4. Citations extracted from response
5. Web search disabled for normal chat
6. Error handling for search failures
7. Cost tracking for search usage

### Integration Tests

**File:** `src/services/__tests__/troubleshooting-integration.test.ts`

**Test Cases:**
1. Troubleshooting mode triggers web search
2. Event history + web search combined analysis
3. Citation display in chat response
4. Search results improve troubleshooting accuracy
5. Fallback to non-search mode if search fails

### Manual Testing Scenarios

1. **Random Light Activation** (User's Original Issue):
   - User: "My living room light turns on randomly, help me fix it"
   - Expected: Web search for SmartThings automation issues
   - Verify: Citations from SmartThings community, support docs

2. **Device Offline:**
   - User: "My thermostat is offline"
   - Expected: Event history shows gaps + web search for connectivity solutions
   - Verify: Combined analysis of local data and online solutions

3. **Routine Not Working:**
   - User: "My morning routine stopped working"
   - Expected: Web search for common SmartThings routine issues
   - Verify: Recent articles and solutions included

---

## 9. Documentation Requirements

### User-Facing Documentation

**File:** `docs/troubleshooting-mode.md`

**Contents:**
- How to activate troubleshooting mode
- What web search provides
- Privacy considerations (external searches)
- Citation interpretation
- Cost implications (if user-funded)

### Developer Documentation

**File:** `docs/web-search-integration.md`

**Contents:**
- Architecture overview
- API integration details
- Configuration options
- Cost optimization strategies
- Testing guidelines

### API Reference

**File:** `docs/api-reference-web-search.md`

**Contents:**
- `WebSearchConfig` interface
- `UrlCitation` type
- `LlmResponseWithCitations` interface
- Usage examples
- Best practices

---

## 10. Risks and Mitigation

### Risk 1: Increased Costs

**Risk Level:** Medium
**Impact:** Higher monthly operational costs

**Mitigation:**
- Implement search result limits (max_results: 3)
- Use `search_context_size: 'low'` for simple queries
- Only enable for troubleshooting mode, not general chat
- Track usage and costs with analytics
- Consider per-user rate limiting for high-volume scenarios

### Risk 2: Search Quality Variability

**Risk Level:** Low
**Impact:** Irrelevant search results reducing usefulness

**Mitigation:**
- Use custom `search_prompt` to guide query generation
- Native Anthropic search generally high quality
- Fallback to local troubleshooting if search fails
- User feedback mechanism to improve search queries

### Risk 3: Privacy Concerns

**Risk Level:** Low
**Impact:** User concerns about external searches

**Mitigation:**
- Clear disclosure that troubleshooting uses web search
- No sensitive user data sent in search queries
- Only device types and issue descriptions searched
- Opt-out available (use local troubleshooting only)

### Risk 4: Rate Limiting

**Risk Level:** Low
**Impact:** Service degradation during high usage

**Mitigation:**
- Exponential backoff already implemented in LLM service
- Monitor rate limit errors
- Consider request queuing for high load
- Fallback to non-search mode if rate limited

---

## 11. Success Metrics

### Quantitative Metrics

1. **Troubleshooting Success Rate:**
   - Target: 80% of troubleshooting sessions result in issue resolution
   - Measurement: User feedback and follow-up queries

2. **Search Relevance:**
   - Target: 90% of citations marked as helpful by users
   - Measurement: Citation click-through and feedback

3. **Cost per Troubleshooting Session:**
   - Target: <$0.10 per session (search + LLM costs)
   - Measurement: Usage analytics

4. **Response Time:**
   - Target: <5 seconds for troubleshooting response
   - Measurement: Latency monitoring

### Qualitative Metrics

1. **User Satisfaction:**
   - Target: 4.5/5 star rating for troubleshooting mode
   - Measurement: User surveys

2. **Solution Quality:**
   - Target: Solutions apply to user's specific SmartThings setup
   - Measurement: Qualitative feedback analysis

3. **Citation Quality:**
   - Target: 80% of citations from authoritative sources
   - Measurement: Manual review of source domains

---

## 12. Next Steps

### Immediate (This Phase)

1. ✅ Complete this research document (DONE)
2. ⏳ Create implementation plan ticket breakdown
3. ⏳ Begin LLM service enhancement (add web search support)
4. ⏳ Write unit tests for web search functionality

### Short-term (Next Sprint)

1. ⏳ Design and implement troubleshooting system prompts
2. ⏳ Create mode detection logic in ChatOrchestrator
3. ⏳ Integrate event history analysis with web search results
4. ⏳ Add citation display in chat UI

### Medium-term (Future Enhancements)

1. Search result caching for common issues
2. Smart search triggering (ML-based detection)
3. Usage analytics dashboard
4. User feedback loop for search quality

---

## 13. References

### Official Documentation

- [OpenRouter Web Search Feature](https://openrouter.ai/docs/guides/features/web-search)
- [OpenRouter API Documentation](https://openrouter.ai/docs)
- [Anthropic Claude API](https://docs.anthropic.com/)
- [Perplexity API](https://docs.perplexity.ai/)

### Community Resources

- [OpenRouter Web Search Announcement (Twitter)](https://x.com/OpenRouterAI/status/1907623560522379436)
- [Beyond Perplexity: OpenRouter Web Search Analysis](https://bertomill.medium.com/beyond-perplexity-how-open-router-web-search-is-a-game-changer-a971737dab05)
- [LibreChat OpenRouter Web Search Discussion](https://github.com/danny-avila/LibreChat/discussions/9847)

### Internal Documentation

- `docs/research/smartthings-event-history-api-2025-11-27.md` (Phase 1)
- `docs/event-retrieval-design.md` (Phase 1)
- `src/services/llm.ts` (Current LLM implementation)

---

## 14. Conclusion

**OpenRouter web search is production-ready and suitable for our troubleshooting mode requirements.**

**Key Takeaways:**

✅ **Native Support:** Claude Sonnet 4.5 has native web search (our current model)
✅ **Simple Integration:** Minimal code changes required (`:online` suffix or plugin config)
✅ **Standardized Citations:** Consistent format across all models
✅ **Cost-Effective:** ~$0.004-0.006 per search with native Anthropic search
✅ **Flexible Configuration:** Granular control over search parameters
✅ **Production-Ready:** Active development and community support

**Recommendation:** Proceed with Phase 2b (Troubleshooting Mode Implementation) using plugin-based configuration for maximum control and optimization.

**Next Document:** `docs/troubleshooting-mode-design.md` (system prompts and orchestration flow)

---

**Research Completed By:** PM
**Date:** November 27, 2025
**Review Status:** Ready for Engineering Team
**Ticket:** 1M-274 Phase 2
