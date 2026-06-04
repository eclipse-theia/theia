// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { PromptService } from '@theia/ai-core/lib/common';
import { getQaapTasksBackgroundContextFragment } from '../common/qaap-tasks-background-prompt-template';

/**
 * Registers the Qaap "tasks background" global context as a built-in, user-editable prompt
 * fragment. It is standalone (not attached to an agent's variant set) so it surfaces in
 * AI Configuration → Prompt Fragments under its own id, where the user can edit or reset it.
 *
 * The QAIQ bridge ({@link QaapQaiqChatAgentContribution}) resolves this fragment at invoke time
 * and prepends it — together with the workspace `project-info` artifact — to the prompt it sends
 * to the cloud agent runner.
 */
@injectable()
export class QaapTasksBackgroundPromptContribution implements FrontendApplicationContribution {

    @inject(PromptService)
    protected readonly promptService: PromptService;

    onStart(): void {
        this.promptService.addBuiltInPromptFragment(getQaapTasksBackgroundContextFragment());
    }
}
