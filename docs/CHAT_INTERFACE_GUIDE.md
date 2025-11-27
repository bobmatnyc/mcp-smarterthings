# SmartThings Terminal Chat Interface

## Quick Start

The chat interface lets you test device discovery and control using natural language in your terminal.

### Prerequisites

You need to configure your SmartThings Personal Access Token (PAT) and OpenRouter API Key.

**Option 1: Use the Interactive Config Menu** (Recommended)
```bash
pnpm config:dev
```

The config menu provides:
- ✅ Interactive PAT and API key setup
- ✅ Token validation and testing
- ✅ Secure credential storage
- ✅ Status display

**Option 2: Manual Configuration**

Create or edit `.env.local` file:
```bash
SMARTTHINGS_PAT=your-smartthings-personal-access-token
OPENROUTER_API_KEY=your-openrouter-api-key
```

### Running the Chat Interface

**Development Mode** (fastest, no build required):
```bash
pnpm chat:dev
```

**Production Mode** (builds first):
```bash
pnpm chat
```

---

## Testing Device Discovery

### List All Devices
```
You: List all my devices
```

### List Devices by Room
```
You: Show me devices in the living room
You: What devices are in the bedroom?
```

### Check Device Status
```
You: What's the status of the bedroom light?
You: Is the thermostat on?
You: What's the temperature in the living room?
```

### Query Device Capabilities
```
You: What can the living room light do?
You: Show me the capabilities of the thermostat
```

---

## Testing Device Control

### Turn Devices On/Off
```
You: Turn on the living room lights
You: Turn off the bedroom fan
You: Switch on the kitchen light
```

### Adjust Brightness/Levels
```
You: Set living room lights to 50%
You: Dim the bedroom light to 25%
You: Set the kitchen light to maximum brightness
```

### Control Temperature
```
You: Set the thermostat to 72 degrees
You: Increase temperature by 2 degrees
You: Set heating mode
```

### Execute Scenes
```
You: List all scenes
You: Execute the "Movie Time" scene
You: Run the "Good Night" scene
```

---

## Available Commands

While in the chat interface, you can use these commands:

- `/help` - Show available commands
- `/exit` or `/quit` - Exit the chat
- `/history` - Show your message history
- `/clear` - Clear message history
- `Ctrl+C` - Exit the chat

---

## Example Session

```
🏠 SmartThings Chatbot
Control your home with natural language

Type /help for commands, /exit to quit

You: List all devices