/********************************************************************************
 * Copyright (C) 2021 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { enableJSDOM } from '../browser/test/jsdom';
let disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import * as markdownit from 'markdown-it';
import { MarkdownRenderer } from './markdown-renderer';

disableJSDOM();

describe('MarkdownRenderer', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    it('Should render markdown', () => {
        const markdownRenderer = new MarkdownRenderer();
        const result = markdownRenderer.renderInline('[title](link)').innerHTML;
        expect(result).to.be.equal('<a href="link">title</a>');
    });

    it('Should accept and use custom engine', () => {
        const engine = markdownit();
        const originalTextRenderer = engine.renderer.rules.text!;
        engine.renderer.rules.text = (tokens, idx, options, env, self) => `[${originalTextRenderer(tokens, idx, options, env, self)}]`;
        const markdownRenderer = new MarkdownRenderer(engine);
        const result = markdownRenderer.renderInline('text').innerHTML;
        expect(result).to.be.equal('[text]');
    });

    it('Should modify rendered markdown in place', () => {
        const markdownRenderer = new MarkdownRenderer().modify('a', a => {
            a.href = 'something-else';
        });
        const result = markdownRenderer.renderInline('[title](link)').innerHTML;
        expect(result).to.be.equal('<a href="something-else">title</a>');
    });

    it('Should modify descendants of children', () => {
        const markdownRenderer = new MarkdownRenderer().modify('em', em => {
            const strong = document.createElement('strong');
            // eslint-disable-next-line no-unsanitized/property
            strong.innerHTML = em.innerHTML;
            return strong;
        });
        const result = markdownRenderer.render('**bold *bold and italic***').innerHTML;
        expect(result).to.be.equal('<p><strong>bold <strong>bold and italic</strong></strong></p>\n');
    });

    it('Should modify descendants of children after previous modification', () => {
        const markdownRenderer = new MarkdownRenderer().modify('em', em => {
            const strong = document.createElement('strong');
            // eslint-disable-next-line no-unsanitized/property
            strong.innerHTML = em.innerHTML;
            return strong;
        }).modify('strong', strong => { // Will pick up both the original and modified strong element
            const textNode = strong.childNodes.item(0);
            textNode.textContent = `changed_${textNode.textContent}`;
        });
        const result = markdownRenderer.render('**bold *bold and italic***').innerHTML;
        expect(result).to.be.equal('<p><strong>changed_bold <strong>changed_bold and italic</strong></strong></p>\n');
    });
});
