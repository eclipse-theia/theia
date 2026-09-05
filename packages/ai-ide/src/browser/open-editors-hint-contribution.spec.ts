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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});
import { expect } from 'chai';
import { OPEN_EDITORS_HINT_FRAGMENT_ID } from '../common/open-editors-hint-fragment-id';
import { getCoderAgentModePromptTemplate, getCoderAgentModeNextPromptTemplate, getCoderPromptTemplateEdit } from '../common/coder-replace-prompt-template';
import { universalTemplate, universalTemplateVariant } from '../common/universal-prompt-template';
import { UniversalChatAgent } from '../common/universal-chat-agent';
import { architectSystemVariants } from './architect-prompt-template';
import { OPEN_EDITORS_HINT_TEMPLATE } from './open-editors-hint-contribution';
import { CoderAgent } from './coder-agent';
import { ArchitectAgent } from './architect-agent';

// Constructed here, while jsdom is still enabled: their field initializers read
// FrontendApplicationConfigProvider.get(), which needs `window`. Their init() is @postConstruct
// and is not run outside of DI, so this is safe without a full container.
const agentsWithOpenEditorsHintTurnPrompt = [new CoderAgent(), new ArchitectAgent(), new UniversalChatAgent()];

disableJSDOM();

describe('open-editors-hint', () => {
    const include = `{{prompt:${OPEN_EDITORS_HINT_FRAGMENT_ID}}}`;
    const systemTemplates = [
        getCoderAgentModePromptTemplate(), getCoderAgentModeNextPromptTemplate(), getCoderPromptTemplateEdit(),
        architectSystemVariants.defaultVariant, ...(architectSystemVariants.variants ?? []),
        universalTemplate, universalTemplateVariant
    ];

    it('is no longer included in any shipped system prompt (it is sent per turn instead)', () => {
        for (const template of systemTemplates) {
            expect(template.template, template.id).not.to.contain(include);
            expect(template.template, template.id).not.to.contain('{{openEditors}}');
        }
    });

    it('describes the list as current as of the message and references the openEditors variable', () => {
        expect(OPEN_EDITORS_HINT_TEMPLATE).to.contain('as of this message');
        expect(OPEN_EDITORS_HINT_TEMPLATE).to.contain('{{openEditors}}');
    });

    it('is declared as the turn prompt of Coder, Architect and Universal, so it is sent per turn instead', () => {
        for (const agent of agentsWithOpenEditorsHintTurnPrompt) {
            expect((agent as unknown as { turnPromptId?: string }).turnPromptId, agent.id).to.equal(OPEN_EDITORS_HINT_FRAGMENT_ID);
        }
    });
});
