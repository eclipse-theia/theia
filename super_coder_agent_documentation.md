# SuperCoder Agent: Advanced AI Coding Assistant

## Overview

The SuperCoder Agent is an advanced AI-powered coding assistant integrated into Theia IDE. It's designed to help developers with complex coding tasks, automated refactoring, multi-step operations, and more. It leverages powerful language models from providers like OpenAI, Google, and Anthropic.

## Key Capabilities

*   **Advanced Code Understanding & Generation:** Understands complex code structures and can generate sophisticated code snippets or entire file contents based on your requests.
*   **File System Interaction:** Can read existing files, list directory structures, and propose creations, deletions, or modifications to files in your workspace.
*   **Changeset-based Edits:** All proposed file modifications are presented as changesets. This allows you to review every line of change in a diff viewer and approve or reject it before it's physically applied to your codebase, ensuring you always have the final say.
*   **Autonomous Mode:** For complex or multi-faceted tasks, SuperCoder can:
    *   Generate a detailed, step-by-step execution plan.
    *   Present this plan to you for approval.
    *   Carry out the approved plan autonomously, informing you of its progress at each step.
*   **Configurable LLM Backend:** You can customize which Large Language Model (LLM) SuperCoder uses through Theia's AI preferences, allowing you to choose models that best suit your needs for power, speed, or cost.

## Using the SuperCoder Agent

### Invocation

1.  Open the AI Chat view in Theia (typically found in the side panel or via a command).
2.  Type `@SuperCoder` followed by your request or question in the chat input field. For example:
    ```
    @SuperCoder refactor the ProductService class to use the new InventoryAPI.
    ```
    Or, for a more complex task you might want it to handle autonomously:
    ```
    @SuperCoder /autonomous Implement a new REST endpoint /products/{id}/details including service and repository layers.
    ```

### Standard Interaction

When you interact with SuperCoder without the autonomous mode trigger, it operates as a conversational assistant:
1.  It will discuss your task, ask clarifying questions if needed, and then perform the requested actions.
2.  If file changes are necessary, SuperCoder will describe the changes it intends to make and then propose them as a changeset.
3.  You can review these changes in Theia's diff viewer and then accept or discard them. The agent will be notified of the tool's success in proposing the change.

### Autonomous Mode

For more complex tasks that might involve multiple steps, file modifications, and analysis, you can instruct SuperCoder to operate in autonomous mode.

**1. Initiating Autonomous Mode:**
   Start your request with the `/autonomous` or `/auto` command followed by the task description.
   For example:
   ```
   @SuperCoder /autonomous Refactor the entire data access layer to use asynchronous operations and update all calling services.
   ```
   Or:
   ```
   @SuperCoder /auto Add comprehensive JSDoc comments to all public methods in the 'utils' package.
   ```

**2. Plan Review and Approval:**
   *   SuperCoder will analyze your request and generate a multi-step execution plan.
   *   This plan will be presented to you in the chat window, with each step clearly numbered.
   *   You will be asked to approve the plan. Type "yes", "ok", or "proceed" to approve. Type "no" or "cancel" to reject the plan and abort the autonomous operation.

**3. Execution:**
   *   Once you approve the plan, SuperCoder will begin executing each step sequentially.
   *   It will inform you about the current step being performed (e.g., "**Executing Step 1/5:** Read content of `UserService.ts`...").
   *   If a step involves file modifications, these will still be proposed as changesets. **You will need to review and apply these changesets manually through Theia's UI for the autonomous process to effectively use the updated code in subsequent steps.**
   *   The agent will proceed to the next step in its plan even if changesets from a previous step are still pending your review. It will, however, notify you at the beginning of the next step if it detects that a changeset was proposed in the prior step, reminding you to review it.

**4. Interruption:**
   *   At any point during autonomous execution (while it's performing a step, or even while it's waiting for you to approve a plan), you can type "stop" or "cancel" in the chat.
   *   SuperCoder will halt its current operation, confirm the cancellation, and await further instructions. Its internal plan and state for the autonomous task will be cleared.

## Configuring the Language Model

You can tailor SuperCoder's performance and capabilities by selecting a specific Large Language Model for its use:

1.  Navigate to Theia's preferences (usually File > Settings > Preferences, or `Ctrl/Cmd + ,`).
2.  Search for "AI" or "Language Models" to find the AI configuration settings.
3.  Look for a section related to "Agent Configuration" or "LLM Assignments".
4.  Within this section, find an entry for `SuperCoderAgent` (it might be displayed as "Super Coder" or similar).
5.  Associated with SuperCoder, you will find a "purpose" dropdown or selection field. Choose the purpose named "**super-coding**".
6.  Next to this purpose, there will be another dropdown list allowing you to select from all the Language Models you have configured in Theia (e.g., different OpenAI models like GPT-4o, GPT-3.5-turbo, Google Gemini models, Anthropic Claude models, etc.). Select your preferred model.
7.  Save your preference changes if required by the UI. SuperCoder will now use the selected LLM for its operations under the "super-coding" purpose.

## System Prompts

The SuperCoder Agent's behavior, its approach to tasks, and its interaction style are guided by system prompts. These prompts are foundational instructions given to the Large Language Model.
*   The main system prompt is defined in `packages/ai-ide/src/common/super-coder-prompts.ts` (see `getSuperCoderSystemPrompt`). This prompt includes instructions on how to interact with workspace tools, how to format responses, and the general persona of the agent.
*   For autonomous plan generation, a specific, hardcoded system prompt is used within the `generateAndProposePlan` method in `super-coder-agent.ts`. This prompt is highly focused on eliciting a clear, step-by-step plan from the LLM.

## File Modification Tools Used

SuperCoder Agent proposes changes to your workspace files using specific tools that integrate with Theia's changeset system. This means you always get to review changes before they are applied. The primary tools are:

*   **`changeSet_writeChangeToFile` (ID: `WRITE_CHANGE_TO_FILE_PROVIDER_ID`):**
    *   Used for creating entirely new files.
    *   Used for completely overwriting an existing file with new content.
    *   Can be used to delete a file by proposing to write empty content to it.
*   **`changeSet_replaceContentInFile` (ID: `REPLACE_CONTENT_IN_FILE_PROVIDER_ID`):**
    *   Used for making targeted replacements of specific segments of text within an existing file. This is useful for refactoring, fixing errors, or adding specific code blocks without altering the rest of the file.

All modifications proposed by these tools are displayed in Theia's diff viewer as part of a changeset, ensuring you have full control over what gets committed to your codebase.
```
