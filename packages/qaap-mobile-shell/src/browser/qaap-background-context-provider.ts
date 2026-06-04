// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { AIVariableContext, PromptService } from '@theia/ai-core';
import { QAAP_TASKS_BACKGROUND_CONTEXT_PROMPT_ID } from '../common/qaap-tasks-background-prompt-ids';

/**
 * Resolves the editable, cross-project Qaap background-agent context fragment
 * (`qaap-tasks-background-context`) from the PromptService so frontend task/conversation
 * creators can forward it as `contextPreamble`. The backend has no PromptService, so it cannot
 * resolve this itself; it only reads the per-project `project-info` artifact from the workspace.
 */
@injectable()
export class QaapBackgroundContextProvider {

    @inject(PromptService)
    protected readonly promptService: PromptService;

    /** Resolved fragment text, or undefined when the fragment is absent/empty or resolution fails. */
    async resolve(context?: AIVariableContext): Promise<string | undefined> {
        try {
            const resolved = await this.promptService.getResolvedPromptFragment(QAAP_TASKS_BACKGROUND_CONTEXT_PROMPT_ID, undefined, context);
            const text = resolved?.text.trim();
            return text || undefined;
        } catch {
            return undefined;
        }
    }
}
