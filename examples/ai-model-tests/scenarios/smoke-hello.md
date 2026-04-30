---
id: smoke-hello
description: Basic connectivity and response quality check
agent: Coder
runs: 2
# models:                           # uncomment to test specific models instead of all defaults
#   - anthropic/claude-opus-4-7
#   - openai/gpt-5.5
#   - google/gemini-3.1-pro-preview
---

# Prompt

You are an AI coding assistant integrated into an IDE called Eclipse Theia. Briefly introduce yourself and describe what kind of tasks you can help with. Keep your response under 200 words.

# Expected Behavior

- Acknowledges being a coding assistant
- Mentions relevant capabilities (code generation, debugging, explanation, etc.)
- Response is coherent and well-structured
- Response is concise (under 200 words)
