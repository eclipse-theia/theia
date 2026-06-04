// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/**
 * Built-in, user-editable prompt fragment holding the GLOBAL context/rules that are
 * prepended to every Qaap cloud background-agent prompt (QAIQ, Aider, Codex, …).
 *
 * Backend agents are CLIs spawned in the workspace `cwd`; they never read Theia's
 * PromptService. The QAIQ bridge therefore resolves this fragment (plus the per-project
 * `project-info` artifact) and prepends the text to the prompt it sends to the runner.
 *
 * Lives in `common` so QAIQ (qaap-mobile-shell) and the registrar (qaap-ai-config, which
 * depends on qaap-mobile-shell) share one id without an import cycle.
 */
export const QAAP_TASKS_BACKGROUND_CONTEXT_PROMPT_ID = 'qaap-tasks-background-context';

/** Workspace prompt fragment id for the per-project info artifact (`.prompts/project-info.prompttemplate`). */
export const QAAP_PROJECT_INFO_PROMPT_ID = 'project-info';
