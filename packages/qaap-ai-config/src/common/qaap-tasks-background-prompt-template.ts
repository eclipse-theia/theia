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
const QAAP_TASKS_BACKGROUND_CONTEXT_TEMPLATE = `# Qaap environment context

You are running inside a **Qaap cloud workspace** — an ephemeral, per-project sandbox that holds this repository. Paths are relative to the workspace root; do not assume any path from another project or machine.

For web projects, a live in-IDE preview of the running app may be available.

This is cross-project context. Project-specific details (stack, build/test commands, conventions) follow below when a project-info artifact is present.`;

export function getQaapTasksBackgroundContextFragment(): BasePromptFragment {
    return {
        id: QAAP_TASKS_BACKGROUND_CONTEXT_PROMPT_ID,
        template: QAAP_TASKS_BACKGROUND_CONTEXT_TEMPLATE,
    };
}
