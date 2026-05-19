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

import { CustomAgentPromptVariant, LanguageModelRequirement } from '@theia/ai-core';
import { AbstractStreamParsingChatAgent } from './chat-agents';
import { injectable } from '@theia/core/shared/inversify';

@injectable()
export class CustomChatAgent extends AbstractStreamParsingChatAgent {
    id: string = 'CustomChatAgent';
    name: string = 'CustomChatAgent';
    languageModelRequirements: LanguageModelRequirement[] = [{ purpose: 'chat' }];
    protected defaultLanguageModelPurpose: string = 'chat';

    set prompt(prompt: string) {
        // the name is dynamic, so we set the promptId here
        this.systemPromptId = `${this.name}_prompt`;
        this.prompts.push({ id: this.systemPromptId, defaultVariant: { id: `${this.name}_prompt`, template: prompt } });
    }

    /**
     * Replace the variants of this agent's prompt set with the given list. Must be called
     * AFTER {@link prompt} has been set, since it mutates the most recently pushed prompt set.
     * Each entry becomes an additional variant of the default prompt; the variant id is used
     * verbatim as the fragment id.
     */
    set promptVariants(variants: CustomAgentPromptVariant[] | undefined) {
        if (!variants || variants.length === 0) {
            return;
        }
        const promptSet = this.prompts[this.prompts.length - 1];
        if (!promptSet) {
            return;
        }
        promptSet.variants = variants.map(v => ({ id: v.id, template: v.template }));
    }
}
