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

import { AGENTS_MD_PROMPT_FRAGMENT_ID, BasePromptFragment, parseCapabilitiesFromTemplate } from '@theia/ai-core/lib/common';
import { expect } from 'chai';
import { GenericEditorAgent } from './generic-editor-agent.js';

class TestGenericEditorAgent extends GenericEditorAgent {
    get defaultPrompt(): BasePromptFragment | undefined {
        return this.prompts.find(prompt => prompt.id === this.systemPromptId)?.defaultVariant;
    }
}

describe('GenericEditorAgent', () => {
    it('uses its own system prompt with the coding model and shared project context', () => {
        const agent = new TestGenericEditorAgent();
        expect(agent.id).to.equal('generic-editor');
        expect(agent.languageModelRequirements).to.deep.equal([{ purpose: 'chat', identifier: 'default/code' }]);
        expect(agent.defaultPrompt?.id).to.equal('generic-editor-system');
        expect(agent.defaultPrompt?.template).to.contain(`{{prompt:${AGENTS_MD_PROMPT_FRAGMENT_ID}}}`);
    });

    it('preserves the prepared capability defaults', () => {
        const { defaultPrompt } = new TestGenericEditorAgent();
        expect(parseCapabilitiesFromTemplate(defaultPrompt!.template)).to.deep.equal([
            { fragmentId: 'shell-execution', defaultEnabled: true },
            { fragmentId: 'github', defaultEnabled: false },
            { fragmentId: 'code-review-mode', defaultEnabled: true },
            { fragmentId: 'apptester', defaultEnabled: false },
            { fragmentId: 'memory', defaultEnabled: true }
        ]);
    });
});
