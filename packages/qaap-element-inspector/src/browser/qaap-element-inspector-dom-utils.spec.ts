// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import type { PickedElement } from './element-inspector-types';
import { buildElementCssSelector, formatElementAgentPrompt, guessElementComponentPath } from './qaap-element-inspector-dom-utils';

function samplePicked(overrides: Partial<PickedElement> = {}): PickedElement {
    return {
        pickedId: 'pick-1',
        tagName: 'BUTTON',
        classes: ['primary', 'cta'],
        attributes: [{ name: 'data-component', value: 'SubmitButton' }],
        textPreview: 'Save',
        outerHTML: '<button class="primary cta" data-component="SubmitButton">Save</button>',
        domPath: 'body > main > button',
        position: { top: 0, left: 0, width: 80, height: 32 },
        computedStyles: {},
        ancestors: [],
        pageUrl: 'http://127.0.0.1:5173/',
        ...overrides,
    };
}

describe('qaap-element-inspector-dom-utils', () => {

    it('buildElementCssSelector prefers id then classes', () => {
        expect(buildElementCssSelector(samplePicked({ id: 'save' }))).to.equal('button#save');
        expect(buildElementCssSelector(samplePicked())).to.equal('button.primary.cta');
    });

    it('guessElementComponentPath maps data-component to a source path hint', () => {
        expect(guessElementComponentPath(samplePicked())).to.equal('src/components/SubmitButton.tsx');
    });

    it('formatElementAgentPrompt includes domPath and truncated HTML', () => {
        const prompt = formatElementAgentPrompt(samplePicked());
        expect(prompt).to.include('DOM path: body > main > button');
        expect(prompt).to.include('CSS selector:');
        expect(prompt).to.include('<button');
    });
});
