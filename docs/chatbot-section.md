## Usage with Interactive Chatbot

The MCP SmartThings server includes a built-in chatbot that provides a natural language interface for controlling your devices. The chatbot connects to the MCP server via the MCP protocol, validating that the server works correctly while providing an intuitive user experience.

### Quick Start

```bash
# Build the project
npm run build

# Start chatbot (ensure .env.local is configured)
npm run chat
```

### Configuration

The chatbot requires two environment variables in `.env.local`:

```env
# SmartThings Personal Access Token (required)
SMARTTHINGS_PAT=your_smartthings_token_here

# OpenRouter API Key (required for LLM access)
OPENROUTER_API_KEY=sk-or-v1-your_openrouter_key_here
```

**Getting an OpenRouter API Key:**

1. Visit [OpenRouter](https://openrouter.ai/)
2. Sign up for a free account
3. Navigate to API Keys section
4. Generate a new API key
5. Add to `.env.local`

**Free Tier Models:**
- `deepseek/deepseek-chat` (default) - Free, fast, good for home automation
- Other free models available at [OpenRouter Models](https://openrouter.ai/models)

### Using the Chatbot

Once started, you can control your devices using natural language:

```
🏠 SmartThings Chatbot
Control your home with natural language
Type /help for commands, /exit to quit

You: Turn on the living room lights