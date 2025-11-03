# OpenAI Tool Call Issues Troubleshooting

If you're experiencing tool call errors like:

```
400 No tool call found for function call output with <UUID>
```

## Current Solution (Automatic)

**Good news**: Tool calls are now automatically handled correctly. The system automatically routes tool calls to the Chat Completions API even when Response API is enabled, ensuring reliable functionality without any user intervention required.

## What's Happening

The OpenAI Response API has fundamental compatibility issues with tool calling that prevent reliable function calling. The API has different message formats, tool call semantics, and state management requirements.

## Automatic Routing

As of the latest version:
- ✅ **Tool calls**: Automatically use Chat Completions API (reliable)
- ✅ **Text generation**: Uses configured API (Response or Chat Completions)
- ✅ **No user action required**: Everything works seamlessly

## Debug Information

To verify the automatic routing is working:
1. Open browser developer tools (F12)
2. Look for console messages:
   - `Model <id>: Request contains tools, falling back to Chat Completions API`
   - This confirms tool calls are being routed correctly

## Response API Settings

### Official OpenAI Models
1. Open Theia preferences (File > Preferences > Open Preferences)
2. Search for "useResponseApi"
3. Toggle "Use Response API" as desired
4. **Note**: Tool calls will always use Chat Completions API regardless of this setting

### Custom OpenAI-Compatible Endpoints
Set `useResponseApi: true/false` in your model configuration. Tool calls will automatically use Chat Completions API regardless.

## API Status

- **Chat Completion API**: ✅ Fully stable with tool calls
- **Response API**: ✅ Stable for text generation, automatically bypassed for tool calls

## Role Support Issues

### Error Message
```
OpenAI API error: 400 - Invalid request: messages[X]: role 'developer' is not supported
```

### Description
Some OpenAI models (particularly o1-preview and o1-mini) do not support the 'developer' role in messages.

### Solution
This is handled automatically for known models. For custom endpoints with unsupported models:

1. Set `developerMessageSettings` to `'user'` or `'system'` in your custom model configuration:

```json
{
  "model": "o1-mini",
  "url": "https://api.openai.com/v1",
  "developerMessageSettings": "user"
}
```

2. Alternatively, use `'mergeWithFollowingUserMessage'` to combine system messages with user messages.

## Connection and Authentication Issues

### Missing API Key
```
Error: Please provide OPENAI_API_KEY in preferences or via environment variable
```

**Solutions:**
1. Set the environment variable: `export OPENAI_API_KEY=your_key_here`
2. Or set in preferences: AI Features > OpenAI Official > API Key

### Custom Endpoint Issues
For custom OpenAI-compatible endpoints, ensure:
- URL is correct and accessible
- API key is valid (if required)
- Model name matches the endpoint's available models

## Reporting Issues

If you experience issues with the automatic tool call routing, please report:
- The exact error message
- Console debug messages (if any)
- The model configuration
- Steps to reproduce

## Future Plans

The Response API will be used for tool calls once OpenAI resolves the underlying compatibility issues. The current automatic routing approach ensures users get working tool calls without manual intervention.
