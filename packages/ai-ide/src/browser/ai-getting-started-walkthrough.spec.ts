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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});
import { expect } from 'chai';
import { ENABLE_AI_CONTEXT_KEY } from '@theia/ai-core/lib/browser/ai-activation-service';
import { WalkthroughDefinition } from '@theia/getting-started/lib/common/walkthrough-types';
import { AI_GETTING_STARTED_WALKTHROUGH_ID, AiGettingStartedWalkthroughProvider } from './ai-getting-started-walkthrough';
import {
    AI_CHAT_USED_CONTEXT_KEY,
    AI_DEFAULT_AGENT_CONTEXT_KEY,
    AI_MODEL_READY_CONTEXT_KEY,
    AI_TOOL_CONFIRMATION_CONFIGURED_CONTEXT_KEY
} from './ai-walkthrough-context-keys';
disableJSDOM();

/** The commands the walkthrough is allowed to link to; each one is registered by one of the AI packages. */
const KNOWN_COMMANDS = new Set([
    'aiConfiguration:open',
    'aiConfiguration:openTools',
    'aiChat:toggle',
    'workspace:manageTrust',
    'perspective.switch'
]);

const KNOWN_CONTEXT_KEYS = new Set([
    ENABLE_AI_CONTEXT_KEY,
    AI_MODEL_READY_CONTEXT_KEY,
    AI_CHAT_USED_CONTEXT_KEY,
    AI_DEFAULT_AGENT_CONTEXT_KEY,
    AI_TOOL_CONFIRMATION_CONFIGURED_CONTEXT_KEY
]);

describe('AiGettingStartedWalkthroughProvider', () => {

    let walkthrough: WalkthroughDefinition;

    before(() => {
        disableJSDOM = enableJSDOM();
        FrontendApplicationConfigProvider.set({});
        walkthrough = new AiGettingStartedWalkthroughProvider().getWalkthroughs()[0];
    });
    after(() => disableJSDOM());

    it('should contribute the getting started walkthrough', () => {
        const provider = new AiGettingStartedWalkthroughProvider();
        const walkthroughs = provider.getWalkthroughs();

        expect(walkthroughs).to.have.lengthOf(1);
        expect(walkthroughs[0].id).to.equal(AI_GETTING_STARTED_WALKTHROUGH_ID);
        expect(walkthroughs[0].steps.map(step => step.id)).to.deep.equal(
            ['ai-support', 'enable-ai', 'connect-model', 'choose-agent', 'first-question', 'tool-confirmation', 'go-further']);
    });

    it('should give every step an id, a title and a description', () => {
        const ids = walkthrough.steps.map(step => step.id);
        expect(new Set(ids).size).to.equal(ids.length);
        for (const step of walkthrough.steps) {
            expect(step.title, `title of ${step.id}`).to.not.be.empty;
            expect(step.description, `description of ${step.id}`).to.not.be.empty;
        }
    });

    it('should substitute every placeholder', () => {
        for (const step of walkthrough.steps) {
            expect(step.title, `title of ${step.id}`).to.not.match(/\{\d+\}/);
            expect(step.description, `description of ${step.id}`).to.not.match(/\{\d+\}/);
        }
        expect(walkthrough.description).to.not.match(/\{\d+\}/);
    });

    it('should only link to commands that exist', () => {
        for (const step of walkthrough.steps) {
            for (const match of step.description.matchAll(/\(command:([^?)]+)/g)) {
                expect(KNOWN_COMMANDS, `command of ${step.id}`).to.include(match[1]);
            }
        }
    });

    it('should only complete on context keys that are published, so that steps also tick for an already configured user', () => {
        for (const step of walkthrough.steps) {
            for (const event of step.completionEvents ?? []) {
                if (event.startsWith('onContext:')) {
                    expect(KNOWN_CONTEXT_KEYS, `context key of ${step.id}`).to.include(event.substring('onContext:'.length));
                } else {
                    // An `onLink:` event only ever fires for a link the step actually offers.
                    expect(event, `completion event of ${step.id}`).to.match(/^onLink:/);
                    expect(step.description, `link of ${step.id}`).to.include(`(${event.substring('onLink:'.length)})`);
                }
            }
        }
    });

    it('should have a completion event for every step that can be verified', () => {
        const withoutCompletion = walkthrough.steps.filter(step => !step.completionEvents?.length).map(step => step.id);
        // The closing step only points at further reading, so there is nothing to observe; it is marked done by hand.
        expect(withoutCompletion).to.deep.equal(['go-further']);
    });
});
