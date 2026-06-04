// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { PromptService } from '@theia/ai-core/lib/common';
import { getQaapTasksBackgroundPromptTemplate } from '../common/qaap-tasks-background-prompt-template';

/**
 * Registers the Qaap "tasks background" system prompt as a built-in, user-editable
 * prompt fragment. It is intentionally standalone (not attached to an upstream agent's
 * variant set) so it surfaces in AI Configuration → Prompt Fragments under its own id,
 * where the user can edit or reset it without touching code.
 */
@injectable()
export class QaapTasksBackgroundPromptContribution implements FrontendApplicationContribution {

    @inject(PromptService)
    protected readonly promptService: PromptService;

    onStart(): void {
        this.promptService.addBuiltInPromptFragment(getQaapTasksBackgroundPromptTemplate());
    }
}
