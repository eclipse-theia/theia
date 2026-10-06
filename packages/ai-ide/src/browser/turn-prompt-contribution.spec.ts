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
import { BasePromptFragment } from '@theia/ai-core';
import { CHANGE_SET_SUMMARY_VARIABLE } from '@theia/ai-chat/lib/browser/change-set-variable';
import { CONTEXT_FILES_VARIABLE } from '../common/context-files-variable';
import { OPEN_EDITORS_HINT_FRAGMENT_ID } from '../common/open-editors-hint-fragment-id';
import { ARCHITECT_TURN_PROMPT_ID, CODER_TURN_PROMPT_ID, CONTEXT_FILES_HINT_FRAGMENT_ID } from '../common/turn-prompt-fragment-ids';
import { getCoderAgentModePromptTemplate, getCoderAgentModeNextPromptTemplate, getCoderPromptTemplateEdit } from '../common/coder-replace-prompt-template';
import { universalTemplate, universalTemplateVariant } from '../common/universal-prompt-template';
import { projectInfoSystemVariants } from '../common/project-info-prompt-template';
import { createSkillSystemVariants } from '../common/create-skill-prompt-template';
import { architectSystemVariants } from './architect-prompt-template';
import { codeReviewerSystemPrompt } from './code-reviewer-prompt-template';
import { exploreSystemPrompt } from './explore-prompt-template';
import { prReviewSystemPrompt } from './review/pr-review-prompt-template';
import { ARCHITECT_TURN_PROMPT_TEMPLATE, CODER_TURN_PROMPT_TEMPLATE, CONTEXT_FILES_HINT_TEMPLATE } from './turn-prompt-contribution';
import { CoderAgent } from './coder-agent';
import { ArchitectAgent } from './architect-agent';
import { CodeReviewerAgent } from './code-reviewer-agent';
import { ExploreAgent } from './explore-agent';
import { PRReviewAgent } from './review/pr-review-agent';
import { ProjectInfoAgent } from './project-info-agent';
import { CreateSkillAgent } from './create-skill-agent';

// Constructed while jsdom is still enabled: field initializers may read FrontendApplicationConfigProvider.get(),
// which needs `window`. Their init() is @postConstruct and is not run outside of DI.
const agentsWithContextFilesTurnPrompt = [new CodeReviewerAgent(), new ExploreAgent(), new PRReviewAgent(), new ProjectInfoAgent(), new CreateSkillAgent()];
const coder = new CoderAgent();
const architect = new ArchitectAgent();

disableJSDOM();

describe('turn prompts for chat context', () => {
    const turnPromptIdOf = (agent: object): string | undefined => (agent as { turnPromptId?: string }).turnPromptId;
    const variantsOf = (set: { defaultVariant: BasePromptFragment, variants?: BasePromptFragment[] }): BasePromptFragment[] => [set.defaultVariant, ...(set.variants ?? [])];
    const systemTemplates: BasePromptFragment[] = [
        getCoderAgentModePromptTemplate(), getCoderAgentModeNextPromptTemplate(), getCoderPromptTemplateEdit(),
        ...variantsOf(architectSystemVariants),
        universalTemplate, universalTemplateVariant,
        codeReviewerSystemPrompt, exploreSystemPrompt, prReviewSystemPrompt,
        ...variantsOf(projectInfoSystemVariants), ...variantsOf(createSkillSystemVariants)
    ];

    it('no shipped system prompt embeds the attached files or the change set summary any more (they are sent per turn)', () => {
        for (const template of systemTemplates) {
            expect(template.template, template.id).not.to.contain('{{contextFiles}}');
            expect(template.template, template.id).not.to.contain('{{changeSetSummary}}');
        }
    });

    it('the attached-files hint is current as of the message and lists the contextFiles variable', () => {
        expect(CONTEXT_FILES_HINT_TEMPLATE).to.contain('as of this message');
        expect(CONTEXT_FILES_HINT_TEMPLATE).to.contain('{{contextFiles}}');
    });

    it('Coder sends open editors, attached files and the change set summary per turn', () => {
        expect(turnPromptIdOf(coder)).to.equal(CODER_TURN_PROMPT_ID);
        expect(CODER_TURN_PROMPT_TEMPLATE).to.contain(`{{prompt:${OPEN_EDITORS_HINT_FRAGMENT_ID}}}`);
        expect(CODER_TURN_PROMPT_TEMPLATE).to.contain(`{{prompt:${CONTEXT_FILES_HINT_FRAGMENT_ID}}}`);
        expect(CODER_TURN_PROMPT_TEMPLATE).to.contain('{{changeSetSummary}}');
    });

    it('Architect sends open editors and attached files per turn', () => {
        expect(turnPromptIdOf(architect)).to.equal(ARCHITECT_TURN_PROMPT_ID);
        expect(ARCHITECT_TURN_PROMPT_TEMPLATE).to.contain(`{{prompt:${OPEN_EDITORS_HINT_FRAGMENT_ID}}}`);
        expect(ARCHITECT_TURN_PROMPT_TEMPLATE).to.contain(`{{prompt:${CONTEXT_FILES_HINT_FRAGMENT_ID}}}`);
        expect(ARCHITECT_TURN_PROMPT_TEMPLATE).not.to.contain('{{changeSetSummary}}');
    });

    it('Code Reviewer, Explore, PR Review, Project Info and Create Skill send the attached files per turn', () => {
        for (const agent of agentsWithContextFilesTurnPrompt) {
            expect(turnPromptIdOf(agent), agent.id).to.equal(CONTEXT_FILES_HINT_FRAGMENT_ID);
        }
    });

    it('the attached files and the change set summary count as volatile, so a system prompt that still embeds them is warned about', () => {
        expect(CONTEXT_FILES_VARIABLE.isVolatile).to.be.true;
        expect(CHANGE_SET_SUMMARY_VARIABLE.isVolatile).to.be.true;
    });
});
