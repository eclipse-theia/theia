/* eslint-disable @typescript-eslint/tslint/config */
// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { BasePromptFragment } from '@theia/ai-core/lib/common';
import { QAAP_TASKS_BACKGROUND_CONTEXT_PROMPT_ID } from '@theia/qaap-mobile-shell/lib/common/qaap-tasks-background-prompt-ids';

/**
 * GLOBAL context prepended to every Qaap cloud background-agent prompt (QAIQ, Aider, Codex, …).
 *
 * Keep this short and cross-project: it carries facts true for ALL Qaap workspaces. Per-project
 * details come from the workspace `project-info` artifact, which the QAIQ bridge appends right
 * after this block. This is NOT a behavioral system prompt — the CLI agent has its own — it is
 * platform context plus a few operating rules that only hold in the cloud sandbox.
 *
 * Plain text (no `{{variables}}`) so it resolves cleanly regardless of editor/chat context.
 * Editable by the user in AI Configuration → Prompt Fragments under its id.
 */
const QAAP_TASKS_BACKGROUND_CONTEXT_TEMPLATE = `# Qaap background-agent context

You are running as a background task inside a **Qaap cloud workspace**, detached, with **no human in the loop** during execution:
- You cannot ask questions mid-task and no one reviews your changes before they are written. Decide autonomously; if truly blocked, stop and report the blocker instead of waiting.
- Apply file changes directly and **verify them yourself** (build / lint / tests). Never defer verification to a user.
- Work only inside the current workspace. No external network or system-level installs unless the task explicitly grants it.
- Keep the diff minimal: change only what the task requires, no drive-by refactors, no comments describing your changes.
- When you finish, report concisely: files changed, what was done, and the verification result (PASS / FAIL). This report is your only output — no one watches your session.

Project-specific context (stack, build/test commands, conventions) follows below, when available.`;

export function getQaapTasksBackgroundContextFragment(): BasePromptFragment {
    return {
        id: QAAP_TASKS_BACKGROUND_CONTEXT_PROMPT_ID,
        template: QAAP_TASKS_BACKGROUND_CONTEXT_TEMPLATE,
    };
}
