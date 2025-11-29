# 1M-325: Sonnet 4.5 Integration Requirements Analysis

**Date:** 2025-11-28
**Ticket:** 1M-325 - Implement Sonnet 4.5 Integration (PM + Coder Modes)
**Status:** Open
**Priority:** Critical
**Estimated Effort:** 3 days
**Parent Epic:** EDGAR Platform (4a248615-f1dd-4669-9f61-edec2d2355ac)
**Parent Issue:** 1M-318 (Phase 1 MVP - Weather API Proof-of-Concept)

---

## Executive Summary

This ticket implements the **core AI integration** for the EDGAR platform, enabling example-driven code generation through a **dual-mode Sonnet 4.5 system**:

1. **PM Mode**: Analyzes example data and designs extraction strategies
2. **Coder Mode**: Generates Python code from strategies with constraint enforcement

This integration is **critical** as it blocks:
- 1M-328: Weather API extractor generation
- 1M-329: Go/No-Go decision for EDGAR platform viability

**Key Constraint**: This is for EDGAR platform (Python code generation), **NOT** the current mcp-smartthings TypeScript codebase.

---

## Context: EDGAR Platform vs. mcp-smartthings

### IMPORTANT DISTINCTION

**What This Ticket IS:**
- Building AI service for **EDGAR platform** (separate project)
- Generating **Python extractors** from examples
- Using Sonnet 4.5 for code generation
- Part of proof-of-concept for example-driven extraction

**What This Ticket IS NOT:**
- Modifying current mcp-smartthings codebase
- TypeScript code generation
- SmartThings device integration
- Extending existing LlmService

### Why This Matters

The mcp-smartthings project has:
- ✅ Existing `LlmService` class (`src/services/llm.ts`)
- ✅ OpenRouter integration with Claude Sonnet 4.5
- ✅ Tool calling infrastructure
- ✅ Conversation context management

**However**, 1M-325 is building a **separate service** for EDGAR platform that generates **Python code**, not enhancing the existing TypeScript chatbot.

---

## EDGAR Platform Overview

From parent epic (4a248615-f1dd-4669-9f61-edec2d2355ac):

> Transform EDGAR into general-purpose, example-driven data extraction platform. 70% code reuse, 6 weeks timeline, Sonnet 4.5 PM+Coder approach.

**Goal**: Enable users to provide 5-10 examples of API data, and automatically generate working Python extractors that:
- Parse API responses
- Transform data to target schema
- Follow architecture constraints (dependency injection, interfaces, Pydantic models)
- Validate against examples with >90% accuracy

---

## Requirements Breakdown

### 1. PM Mode (Pattern Analysis)

**Purpose**: Analyze example data and design extraction strategy

**Input**:
- 5-10 example API responses (JSON, XML, CSV, etc.)
- Target schema specification (Pydantic model)
- Data source metadata (API endpoint, auth type, etc.)

**Output**:
- **Data source type** (REST API, GraphQL, RSS feed, etc.)
- **Extraction patterns** (JSON paths, regex, XPath, etc.)
- **Transformation logic** (field mappings, data type conversions)
- **Validation rules** (required fields, format constraints)

**Prompt Template**:
```
Analyze these API response examples and design an extraction strategy:

Examples:
{example_1}
{example_2}
...
{example_n}

Target Schema:
{pydantic_model}

Design a data extraction strategy including:
1. Data source type (REST API, GraphQL, etc.)
2. Extraction patterns (how to locate each field)
3. Transformation logic (data type conversions, calculations)
4. Validation rules (required fields, formats)

Return strategy as structured JSON.
```

**Expected Response Format**:
```json
{
  "data_source_type": "REST_API",
  "extraction_patterns": {
    "temperature": "$.main.temp",
    "humidity": "$.main.humidity",
    "location": "$.name"
  },
  "transformations": [
    {
      "field": "temperature",
      "operation": "kelvin_to_celsius",
      "formula": "(value - 273.15)"
    }
  ],
  "validation_rules": {
    "temperature": {"type": "float", "range": [-50, 50]},
    "humidity": {"type": "int", "range": [0, 100]}
  }
}
```

### 2. Coder Mode (Code Generation)

**Purpose**: Generate Python code implementing the extraction strategy

**Input**:
- Extraction strategy (from PM mode)
- Architecture constraints (interfaces, DI patterns)
- Target framework (IDataSource, IDataExtractor interfaces)

**Output**:
- **Complete Python module** implementing extractor
- **Pydantic models** for data validation
- **Dependency injection** setup
- **Unit tests** (optional)

**Prompt Template**:
```
Generate Python code implementing this extraction strategy:

Strategy:
{extraction_strategy}

Architecture Requirements:
1. Implement IDataSource interface:
   class IDataSource(Protocol):
       async def fetch(self) -> dict: ...

2. Implement IDataExtractor interface:
   class IDataExtractor(Protocol):
       def extract(self, data: dict) -> ExtractedData: ...

3. Use dependency injection (no hardcoded dependencies)
4. Generate Pydantic models for validation
5. Follow PEP 8 style guide
6. Add type hints for all functions
7. Include docstrings

Constraints:
{architecture_constraints}

Generate complete working Python code.
```

**Expected Response Format**:
```python
from typing import Protocol
from pydantic import BaseModel, Field
import httpx

# Pydantic model
class WeatherData(BaseModel):
    temperature: float = Field(..., description="Temperature in Celsius")
    humidity: int = Field(..., ge=0, le=100)
    location: str

# Data source interface implementation
class WeatherApiDataSource:
    def __init__(self, api_key: str, base_url: str):
        self.api_key = api_key
        self.base_url = base_url

    async def fetch(self, city: str) -> dict:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/weather",
                params={"q": city, "appid": self.api_key}
            )
            return response.json()

# Extractor implementation
class WeatherDataExtractor:
    def extract(self, data: dict) -> WeatherData:
        return WeatherData(
            temperature=data["main"]["temp"] - 273.15,  # Kelvin to Celsius
            humidity=data["main"]["humidity"],
            location=data["name"]
        )
```

### 3. Iterative Refinement

**Purpose**: Improve generated code based on validation failures

**Flow**:
1. Generate initial code (Coder mode)
2. Validate against examples
3. **If validation fails:**
   - Send failure details to PM mode
   - PM mode analyzes failures, updates strategy
   - Coder mode regenerates code
   - Repeat until validation passes or max iterations reached

**Validation Checks**:
- ✅ Code compiles/parses (AST validation)
- ✅ Implements required interfaces (IDataSource, IDataExtractor)
- ✅ Uses dependency injection (no hardcoded config)
- ✅ Follows Pydantic model schema
- ✅ Extracts correct data from examples (>90% accuracy)
- ✅ Handles edge cases (missing fields, null values)

**Max Iterations**: 3 refinement loops (configurable)

---

## Acceptance Criteria

From ticket 1M-325:

- [ ] PM mode analyzes examples and produces extraction strategy
- [ ] Coder mode generates Python code from strategy
- [ ] Generated code uses proper interfaces (IDataSource, IDataExtractor)
- [ ] Code follows architecture constraints (DI, interfaces, Pydantic)
- [ ] Iterative refinement when validation fails
- [ ] Conversation context maintained between PM and Coder modes
- [ ] API key management (OpenRouter integration)

---

## Deliverables

### 1. Sonnet4_5Service Class

**Location**: New EDGAR platform project (not mcp-smartthings)

**Interface**:
```python
class Sonnet4_5Service:
    """Dual-mode LLM service for code generation."""

    def __init__(self, api_key: str, model: str = "anthropic/claude-sonnet-4.5"):
        """Initialize service with OpenRouter credentials."""
        pass

    async def analyze_examples(
        self,
        examples: list[dict],
        target_schema: str
    ) -> ExtractionStrategy:
        """PM Mode: Analyze examples and design extraction strategy."""
        pass

    async def generate_code(
        self,
        strategy: ExtractionStrategy,
        constraints: ArchitectureConstraints
    ) -> str:
        """Coder Mode: Generate Python code from strategy."""
        pass

    async def refine_code(
        self,
        code: str,
        validation_errors: list[ValidationError]
    ) -> str:
        """Iterative refinement based on validation failures."""
        pass
```

### 2. Prompt Templates

**PM Mode Template** (`prompts/pm_mode.txt`):
```
You are a senior data engineer analyzing API responses.

Examples:
{examples}

Target Schema:
{target_schema}

Task: Design a data extraction strategy that explains:
1. How to extract each field from the examples
2. What transformations are needed
3. How to validate the extracted data

Return your strategy as structured JSON.
```

**Coder Mode Template** (`prompts/coder_mode.txt`):
```
You are an expert Python developer generating production-ready code.

Strategy:
{extraction_strategy}

Constraints:
{architecture_constraints}

Task: Generate complete Python code that:
1. Implements the extraction strategy
2. Follows architecture constraints
3. Uses type hints and Pydantic models
4. Includes error handling

Return only the Python code, no explanations.
```

### 3. API Client

**OpenRouter Integration**:
```python
import openai

class OpenRouterClient:
    """OpenRouter API client for Claude Sonnet 4.5."""

    def __init__(self, api_key: str):
        self.client = openai.OpenAI(
            api_key=api_key,
            base_url="https://openrouter.ai/api/v1"
        )

    async def chat(
        self,
        messages: list[dict],
        temperature: float = 0.7,
        max_tokens: int = 4000
    ) -> str:
        """Send chat request to Sonnet 4.5."""
        response = await self.client.chat.completions.create(
            model="anthropic/claude-sonnet-4.5",
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens
        )
        return response.choices[0].message.content
```

### 4. Conversation Context Manager

**Purpose**: Maintain conversation state between PM and Coder mode calls

```python
class ConversationContext:
    """Manages conversation history for PM + Coder iteration."""

    def __init__(self):
        self.messages: list[dict] = []

    def add_user_message(self, content: str):
        """Add user message to history."""
        self.messages.append({"role": "user", "content": content})

    def add_assistant_message(self, content: str):
        """Add assistant response to history."""
        self.messages.append({"role": "assistant", "content": content})

    def get_history(self) -> list[dict]:
        """Get full conversation history."""
        return self.messages.copy()

    def clear(self):
        """Clear conversation history."""
        self.messages = []
```

### 5. Unit Tests

**Test Coverage**:
- PM mode strategy generation
- Coder mode code generation
- Conversation context management
- API client retries and error handling
- Prompt template rendering

### 6. Integration Tests

**End-to-End Test**:
```python
async def test_weather_api_generation():
    """Test complete flow: examples → strategy → code → validation."""

    # Setup
    service = Sonnet4_5Service(api_key=OPENROUTER_KEY)
    examples = load_weather_examples()
    target_schema = load_pydantic_schema("WeatherData")

    # PM Mode: Analyze examples
    strategy = await service.analyze_examples(examples, target_schema)
    assert strategy.data_source_type == "REST_API"

    # Coder Mode: Generate code
    code = await service.generate_code(strategy, constraints)
    assert "class WeatherApiDataSource" in code
    assert "class WeatherDataExtractor" in code

    # Validate generated code
    validator = CodeValidator()
    result = validator.validate(code, examples)
    assert result.accuracy > 0.9  # >90% accuracy requirement
```

---

## Integration Points

### Current mcp-smartthings Codebase (Reference Only)

**Existing LLM Integration** (`src/services/llm.ts`):
- ✅ OpenRouter client already implemented
- ✅ Retry logic with exponential backoff
- ✅ Error handling for rate limits and API errors
- ✅ Tool calling support (not needed for EDGAR)
- ✅ Conversation history management

**Can Reuse Patterns**:
- API client structure (OpenRouter setup)
- Retry strategy (exponential backoff)
- Error handling approach
- Logging patterns

**Cannot Reuse Directly**:
- TypeScript vs Python implementation
- Different use case (chatbot vs code generation)
- No tool calling needed for EDGAR
- Different prompt structures

### New EDGAR Platform Structure

**Recommended Architecture**:
```
edgar-platform/
├── src/
│   ├── services/
│   │   ├── sonnet_service.py      # Main Sonnet4_5Service
│   │   ├── openrouter_client.py   # API client
│   │   └── context_manager.py     # Conversation context
│   ├── prompts/
│   │   ├── pm_mode.txt            # PM mode template
│   │   └── coder_mode.txt         # Coder mode template
│   ├── validators/
│   │   ├── ast_validator.py       # Code syntax validation
│   │   ├── constraint_validator.py # Architecture constraints
│   │   └── accuracy_validator.py  # Example accuracy
│   └── models/
│       ├── extraction_strategy.py  # Strategy data model
│       └── constraints.py          # Architecture constraints
├── tests/
│   ├── unit/
│   └── integration/
└── examples/
    └── weather_api/
        ├── examples.json
        └── target_schema.py
```

---

## Technical Design Recommendations

### 1. Dual-Mode Architecture

**Option A: Single Service with Mode Parameter** (Recommended)
```python
class Sonnet4_5Service:
    async def execute(self, mode: str, input_data: dict) -> dict:
        if mode == "pm":
            return await self._pm_mode(input_data)
        elif mode == "coder":
            return await self._coder_mode(input_data)
```

**Pros**: Simple, maintains context easily
**Cons**: Large class, mixed responsibilities

**Option B: Separate PM and Coder Services**
```python
class PMService:
    async def analyze(self, examples: list[dict]) -> ExtractionStrategy:
        pass

class CoderService:
    async def generate(self, strategy: ExtractionStrategy) -> str:
        pass
```

**Pros**: Clean separation of concerns
**Cons**: Context sharing more complex

### 2. Prompt Engineering Strategy

**Use Chain-of-Thought for PM Mode**:
```
Analyze these examples step-by-step:

1. First, identify common patterns across examples
2. Then, determine data types and validation rules
3. Finally, design extraction strategy

Examples:
...
```

**Use Direct Instructions for Coder Mode**:
```
Generate Python code. Follow these rules:
- Implement IDataSource interface
- Use Pydantic models for validation
- Add type hints
- Include error handling

Do NOT include explanations or markdown formatting.
Output only valid Python code.
```

### 3. Validation Pipeline

**Three-Stage Validation**:
```python
class ValidationPipeline:
    def validate(self, code: str, examples: list[dict]) -> ValidationResult:
        # Stage 1: Syntax validation
        if not self.ast_validator.is_valid(code):
            return ValidationResult(passed=False, stage="syntax")

        # Stage 2: Architecture validation
        if not self.constraint_validator.is_valid(code):
            return ValidationResult(passed=False, stage="architecture")

        # Stage 3: Accuracy validation
        accuracy = self.accuracy_validator.test_against_examples(code, examples)
        if accuracy < 0.9:
            return ValidationResult(passed=False, stage="accuracy", accuracy=accuracy)

        return ValidationResult(passed=True, accuracy=accuracy)
```

### 4. Iterative Refinement Loop

**Max 3 Iterations**:
```python
async def generate_with_refinement(
    self,
    examples: list[dict],
    max_iterations: int = 3
) -> str:
    # Initial generation
    strategy = await self.pm_mode(examples)
    code = await self.coder_mode(strategy)

    # Refinement loop
    for i in range(max_iterations):
        result = self.validator.validate(code, examples)
        if result.passed:
            return code

        # Refine based on failures
        strategy = await self.pm_mode_refine(examples, result.errors)
        code = await self.coder_mode(strategy)

    raise ValidationError(f"Failed to generate valid code after {max_iterations} attempts")
```

---

## API Key Management

**Environment Variables**:
```bash
# OpenRouter API key for Sonnet 4.5
OPENROUTER_API_KEY=sk-or-v1-...

# Optional: Override model
EDGAR_MODEL=anthropic/claude-sonnet-4.5
```

**Configuration**:
```python
from pydantic import BaseSettings

class EdgarConfig(BaseSettings):
    openrouter_api_key: str
    model: str = "anthropic/claude-sonnet-4.5"
    max_retries: int = 3
    timeout: int = 60

    class Config:
        env_file = ".env"
```

---

## Dependencies

**Python Packages**:
```txt
openai>=1.0.0           # OpenRouter client
pydantic>=2.0.0         # Data validation
httpx>=0.24.0           # Async HTTP client
pytest>=7.4.0           # Testing
pytest-asyncio>=0.21.0  # Async test support
```

**API Requirements**:
- OpenRouter account with Sonnet 4.5 access
- API key with sufficient credits
- Rate limit: ~50 requests/min (should be sufficient)

---

## Success Metrics

From parent issue (1M-318):

- [ ] Generated code passes all constraint checks
- [ ] Extractor accuracy >90% vs examples
- [ ] Code generation time <5 minutes
- [ ] Zero manual code editing required

**Additional Metrics**:
- PM mode strategy generation: <30 seconds
- Coder mode code generation: <2 minutes
- Refinement iterations: Average <2 loops
- API cost per generation: <$0.50

---

## Risk Assessment

### HIGH RISK

**1. LLM Code Quality**
- **Risk**: Generated code may not follow architecture constraints
- **Mitigation**: Multi-stage validation, iterative refinement
- **Fallback**: Manual code review and editing

**2. Example Coverage**
- **Risk**: 5-10 examples may not cover all edge cases
- **Mitigation**: Smart example selection, edge case prompting
- **Fallback**: Increase example count requirement

### MEDIUM RISK

**3. API Costs**
- **Risk**: Iterative refinement could be expensive
- **Mitigation**: Max 3 iterations, optimize prompt size
- **Fallback**: Budget alerts, usage tracking

**4. Context Length**
- **Risk**: Large examples + prompts may exceed token limits
- **Mitigation**: Truncate examples, use efficient prompts
- **Fallback**: Switch to Sonnet 3.5 with larger context

### LOW RISK

**5. OpenRouter Availability**
- **Risk**: Service downtime blocks generation
- **Mitigation**: Retry logic, circuit breaker pattern
- **Fallback**: Direct Anthropic API integration

---

## Timeline (3 Days)

### Day 1: Core Infrastructure
- [ ] Setup EDGAR project structure
- [ ] Implement OpenRouter client
- [ ] Create prompt templates
- [ ] Build conversation context manager
- [ ] Unit tests for client and context

### Day 2: PM + Coder Modes
- [ ] Implement PM mode (strategy generation)
- [ ] Implement Coder mode (code generation)
- [ ] Build validation pipeline (syntax, constraints)
- [ ] Integration tests for PM → Coder flow
- [ ] Unit tests for validators

### Day 3: Refinement + Testing
- [ ] Implement iterative refinement loop
- [ ] Build accuracy validator
- [ ] End-to-end integration test (Weather API)
- [ ] Performance testing (generation time)
- [ ] Documentation and examples

---

## Next Steps

### Immediate Actions

1. **Clarify Project Scope**
   - Confirm EDGAR is separate project from mcp-smartthings
   - Get repository URL or create new project structure
   - Verify Python version requirement (3.11+?)

2. **Setup Development Environment**
   - Create EDGAR project structure
   - Setup Python virtual environment
   - Install dependencies (openai, pydantic, httpx)
   - Configure OpenRouter API key

3. **Begin Implementation**
   - Start with Day 1 tasks (core infrastructure)
   - Reference mcp-smartthings LLM patterns
   - Write tests first (TDD approach)

### Questions for PM

1. **Project Location**: Where should EDGAR platform code live?
   - New repository?
   - Subdirectory in mcp-smartthings?
   - Separate monorepo?

2. **Python Version**: What's the minimum Python version?
   - Recommendation: Python 3.11+ for best Pydantic v2 support

3. **Testing Strategy**: Integration tests with real API?
   - Need OpenRouter API credits for testing
   - Mock vs real API calls in CI/CD

4. **Code Style**: PEP 8 + additional standards?
   - Type hints mandatory?
   - Docstring format (Google, NumPy, Sphinx)?
   - Linting tools (ruff, black, mypy)?

---

## Related Tickets

- **1M-318**: Phase 1 MVP - Weather API Proof-of-Concept (parent)
- **1M-328**: Weather API Extractor Generation (blocked by 1M-325)
- **1M-329**: Go/No-Go Decision (blocked by 1M-325)
- **1M-324**: project.yaml Configuration Schema
- **1M-326**: Constraint Enforcer (Basic)
- **1M-327**: Example Parser Implementation

---

## References

### Existing mcp-smartthings Code (Reference Only)

- `src/services/llm.ts`: OpenRouter integration patterns
- `src/services/chatbot.ts`: Conversation management patterns
- `src/services/chat-orchestrator.ts`: Multi-step LLM workflows

### EDGAR Platform Research

- Parent Epic: EDGAR → General-Purpose Extract & Transform Platform
- Goal: Example-driven code generation with 70% code reuse
- Timeline: 6 weeks total, 3 days for this ticket

### External Documentation

- [OpenRouter API Docs](https://openrouter.ai/docs)
- [Claude Sonnet 4.5 Model Card](https://docs.anthropic.com/claude/docs/models-overview)
- [Pydantic V2 Documentation](https://docs.pydantic.dev/latest/)

---

## Conclusion

1M-325 is a **critical foundation** for EDGAR platform, implementing the dual-mode AI system that enables example-driven code generation. Success requires:

- ✅ Clear separation between PM (analysis) and Coder (generation) modes
- ✅ Robust validation pipeline with iterative refinement
- ✅ Conversation context maintained across mode switches
- ✅ Production-ready error handling and retry logic

**Key Constraint**: This is a **new Python project**, not an extension of the existing TypeScript codebase. Reference existing patterns but implement from scratch for Python/EDGAR use case.

**Success Criteria**: Generate Weather API extractor (1M-328) with >90% accuracy, <5min generation time, zero manual editing.
