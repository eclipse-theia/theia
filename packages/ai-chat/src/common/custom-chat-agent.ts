// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { LanguageModelRequirement } from '@theia/ai-core';
import { AbstractStreamParsingChatAgent } from './chat-agents';
import { injectable } from '@theia/core/shared/inversify';

@injectable()
export class CustomChatAgent extends AbstractStreamParsingChatAgent {
    id: string = 'CustomChatAgent';
    name: string = 'CustomChatAgent';
    languageModelRequirements: LanguageModelRequirement[] = [{ purpose: 'chat' }];
    protected defaultLanguageModelPurpose: string = 'chat';

    set prompt(prompt: string) {
        // the name is dynamic, so we set the propmptId here
        this.systemPromptId = `${this.name}_prompt`;
        this.prompts.push({ id: this.systemPromptId, defaultVariant: { id: `${this.name}_prompt`, template: prompt } });
    }
}
