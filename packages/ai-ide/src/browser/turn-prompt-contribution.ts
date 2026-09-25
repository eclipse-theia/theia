// *****************************************************************************
// Copyright (C) 2026 Safi Seid-Ahmad, K2view and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { PromptService } from '@theia/ai-core/lib/common';
import { CHANGE_SET_SUMMARY_VARIABLE_ID } from '@theia/ai-chat';
import { CONTEXT_FILES_VARIABLE_ID } from '../common/context-variables';
import { OPEN_EDITORS_HINT_FRAGMENT_ID } from '../common/open-editors-hint-fragment-id';
import { ARCHITECT_TURN_PROMPT_ID, CODER_TURN_PROMPT_ID, CONTEXT_FILES_HINT_FRAGMENT_ID } from '../common/turn-prompt-fragment-ids';

/**
 * Per-turn hint listing the files the user attached to the chat. Sent inside the user turn (see
 * `AbstractChatAgent.turnPromptId`), not in the system prompt: attaching or removing a file would otherwise rewrite
 * the system prompt and invalidate the prompt cache for the whole conversation.
 */
export const CONTEXT_FILES_HINT_TEMPLATE = `## Provided Files
The following files were provided for additional context as of this message. Some may be referred to by the user \
(e.g. "this file" or "the attachment"). Read the relevant ones before you act.

{{${CONTEXT_FILES_VARIABLE_ID}}}`;

/**
 * Coder's turn prompt: the open editors, the attached files and the summary of its change set. The change set
 * summary renders its own heading and is empty while nothing has been changed.
 */
export const CODER_TURN_PROMPT_TEMPLATE = `{{prompt:${OPEN_EDITORS_HINT_FRAGMENT_ID}}}

{{prompt:${CONTEXT_FILES_HINT_FRAGMENT_ID}}}

{{${CHANGE_SET_SUMMARY_VARIABLE_ID}}}`;

/** Architect's turn prompt: the open editors and the attached files. */
export const ARCHITECT_TURN_PROMPT_TEMPLATE = `{{prompt:${OPEN_EDITORS_HINT_FRAGMENT_ID}}}

{{prompt:${CONTEXT_FILES_HINT_FRAGMENT_ID}}}`;

/** Registers the per-turn prompt fragments that carry chat context which changes between turns. */
@injectable()
export class TurnPromptContribution implements FrontendApplicationContribution {

    @inject(PromptService)
    protected readonly promptService: PromptService;

    onStart(): void {
        this.promptService.addBuiltInPromptFragment({ id: CONTEXT_FILES_HINT_FRAGMENT_ID, template: CONTEXT_FILES_HINT_TEMPLATE });
        this.promptService.addBuiltInPromptFragment({ id: CODER_TURN_PROMPT_ID, template: CODER_TURN_PROMPT_TEMPLATE });
        this.promptService.addBuiltInPromptFragment({ id: ARCHITECT_TURN_PROMPT_ID, template: ARCHITECT_TURN_PROMPT_TEMPLATE });
    }
}
