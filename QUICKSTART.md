# 🚀 Quick Start Guide

Get up and running with SmartThings MCP Server in 3 easy steps!

---

## Step 1: Configure Your Credentials

Run the interactive configuration menu:

```bash
pnpm config:dev
```

**What it does:**
- ✅ Guides you through SmartThings PAT setup
- ✅ Validates your token with SmartThings API
- ✅ Stores credentials securely in `.env.local`
- ✅ Tests OpenRouter API key

**What you'll need:**
1. **SmartThings Personal Access Token (PAT)**
   - Get it here: https://account.smartthings.com/tokens
   - Required scopes: `devices`, `locations`, `scenes`

2. **OpenRouter API Key** (for chat interface)
   - Get it here: https://openrouter.ai/keys
   - Used for natural language processing

---

## Step 2: Test Your Setup

Start the terminal chat interface:

```bash
pnpm chat:dev
```

**Try these commands:**
```
You: List all my devices
You: Show me devices in the living room
You: What's the status of the bedroom light?
```

---

## Step 3: Use the MCP Server

### Option A: Claude Desktop Integration

Add to your Claude Desktop config:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "smartthings": {
      "command": "node",
      "args": ["/path/to/mcp-smartthings/dist/index.js"],
      "env": {
        "SMARTTHINGS_PAT": "your-pat-token-here"
      }
    }
  }
}
```

### Option B: Terminal Chat Interface

Already running from Step 2!

```bash
pnpm chat:dev  # Development mode
pnpm chat      # Production mode
```

### Option C: MCP Inspector (Debug Mode)

```bash
pnpm test:inspector
```

---

## Available Commands

### Configuration
```bash
pnpm config:dev        # Interactive config menu (recommended)
pnpm config            # Production config menu
```

### Chat Interface
```bash
pnpm chat:dev          # Development mode (no build)
pnpm chat              # Production mode (builds first)
```

### Development
```bash
pnpm dev               # Watch mode for development
pnpm build             # Build the project
pnpm test              # Run tests
```

### MCP Server
```bash
pnpm start             # Start MCP server (stdio mode)
pnpm test:inspector    # Start with MCP inspector
```

---

## Troubleshooting

### "Failed to initialize MCP client"

**Cause:** Build artifacts not found

**Solution:**
```bash
pnpm tsc               # Build the project
pnpm chat:dev          # Try again
```

### "Token is invalid"

**Cause:** Expired or incorrect PAT token

**Solution:**
```bash
pnpm config:dev        # Reconfigure your PAT
# Select option 1 to update token
# Select option 3 to test connection
```

### "Failed to fetch home context"

**Cause:** SmartThings API issue (non-fatal)

**Impact:** Chat still works, just without pre-loaded device info

**Solution:**
- Commands will fetch data on-demand
- Or regenerate PAT token with correct scopes

---

## Next Steps

📖 **Read the Guides:**
- [Configuration Menu Guide](docs/CONFIG_MENU_GUIDE.md) - Detailed config help
- [Chat Interface Guide](docs/CHAT_INTERFACE_GUIDE.md) - Chat commands and examples

🔧 **Advanced Usage:**
- Build a custom Alexa skill server
- Integrate with other MCP clients
- Extend with custom tools

🐛 **Need Help?**
- Check existing issues: https://github.com/bobmatnyc/mcp-smarterthings/issues
- File a new issue with error logs
- Include steps to reproduce

---

## Project Structure

```
mcp-smartthings/
├── src/
│   ├── cli/
│   │   ├── config.ts         # Configuration menu
│   │   ├── chat.ts           # Chat interface
│   │   └── alexa-server.ts   # Alexa skill server
│   ├── mcp/
│   │   └── tools/            # MCP tool implementations
│   ├── services/             # Business logic layer
│   └── smartthings/          # SmartThings API client
├── docs/
│   ├── CONFIG_MENU_GUIDE.md
│   └── CHAT_INTERFACE_GUIDE.md
└── .env.local                # Your credentials (create via config menu)
```

---

## What's Next?

1. ✅ Configure credentials (`pnpm config:dev`)
2. ✅ Test chat interface (`pnpm chat:dev`)
3. 🎯 Control your smart home with natural language!

**Example Chat Session:**
```
🏠 SmartThings Chatbot
Control your home with natural language

You: List all devices
Assistant: I found 12 devices across 4 rooms...

You: Turn on the living room lights
Assistant: ✓ Living room lights are now on

You: Set bedroom light to 50%
Assistant: ✓ Bedroom light brightness set to 50%
```

---

**Happy automating! 🏠✨**
