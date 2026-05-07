---
id: coder-reset-button
description: Add a reset button to the token usage view in the AI configuration view
agent: Coder
---

# Prompt

I am working on the Eclipse Theia IDE (TypeScript, React, InversifyJS DI).
There is a token usage view that shows how many tokens each AI model has consumed.
It is implemented in `packages/ai-ide/src/browser/ai-configuration/token-usage-configuration-widget.tsx`.
The widget extends `ReactWidget` and renders a table with columns: Model, Input Tokens, Output Tokens, Total Tokens, Last Used.
Token data comes from `TokenUsageFrontendService` which is injected via InversifyJS.

Please create a plan and then provide the implementation for adding a "Reset" button to this token usage view that clears all tracked token usage data.

Requirements:
- Add a button labeled "Reset Token Usage" in the widget's toolbar or header area
- Clicking it should clear all token usage data via the service
- The view should update immediately after reset
- Follow Theia's coding conventions (InversifyJS, React patterns, localization with nls.localize)

# Expected Behavior

- Identifies the correct widget file and service
- Proposes adding a reset method to TokenUsageFrontendService (or uses an existing one)
- Generates TypeScript/React code for the button
- Uses nls.localize for the button label
- The button triggers data clearing and UI refresh
- Code follows Theia conventions (property injection, arrow functions for event handlers)
