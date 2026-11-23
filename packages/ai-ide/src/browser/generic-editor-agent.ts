// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { AbstractStreamParsingChatAgent } from '@theia/ai-chat/lib/common/chat-agents';
import { LanguageModelRequirement } from '@theia/ai-core/lib/common';
import { ILogger, nls } from '@theia/core';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { GENERIC_EDITOR_SYSTEM_PROMPT_ID, genericEditorSystemPrompt } from './generic-editor-prompt-template.js';

@injectable()
export class GenericEditorAgent extends AbstractStreamParsingChatAgent {
    @inject(ILogger) @named('ai-ide:GenericEditorAgent')
    protected override readonly logger: ILogger;

    readonly id = 'generic-editor';
    readonly name = nls.localize('theia/ai/ide/genericEditorAgent/name', 'Generic Editor');
    override description = nls.localize('theia/ai/ide/genericEditorAgent/description',
        'A general-purpose editing agent that follows project instructions, loads relevant skills, and delegates to specialists when useful.');
    readonly languageModelRequirements: LanguageModelRequirement[] = [{ purpose: 'chat', identifier: 'default/code' }];
    protected readonly defaultLanguageModelPurpose = 'chat';
    override prompts = [{ id: GENERIC_EDITOR_SYSTEM_PROMPT_ID, defaultVariant: genericEditorSystemPrompt }];
    protected override systemPromptId = GENERIC_EDITOR_SYSTEM_PROMPT_ID;
}
