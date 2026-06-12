# plugin-lm-tools

A sample Theia/VS Code plugin that demonstrates the `lm.registerTool` API by registering two language model tools.

## Tools

### sample-getCurrentTime

- **Description:** Returns the current date and time in ISO format.
- **Input:** None (empty object).
- **Output:** ISO 8601 timestamp string.

### sample-calculateSum

- **Description:** Calculates the sum of an array of numbers.
- **Input:** `{ "numbers": [1, 2, 3] }`
- **Output:** A string like `"The sum of [1, 2, 3] is 6."`

## Testing

1. Build and start the Theia browser application.
2. Open the **AI Configuration** view and verify both tools appear in the Tools section
3. Use an agent with these tools enabled and ask it to tell the current time or sum numbers.
4. Check the rendered tool call too verify the result

## License

EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
