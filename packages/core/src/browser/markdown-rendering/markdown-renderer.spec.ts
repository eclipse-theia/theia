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

import { enableJSDOM } from '../test/jsdom';
const disableJSDOM = enableJSDOM();

import { Container } from 'inversify';
import { expect } from 'chai';
import { CommandService } from '../../common';
import { MarkdownStringImpl } from '../../common/markdown-rendering/markdown-string';
import { LabelParser } from '../label-parser';
import { MarkdownRenderer, MarkdownRendererImpl } from './markdown-renderer';

disableJSDOM();

describe('MarkdownRendererImpl', () => {
    let restoreJSDOM: () => void;
    let renderer: MarkdownRenderer;

    before(() => {
        restoreJSDOM = enableJSDOM();
        const container = new Container();
        container.bind(LabelParser).toSelf().inSingletonScope();
        container.bind(CommandService).toConstantValue({
            executeCommand: <T>(): Promise<T | undefined> => Promise.resolve(undefined)
        });
        container.bind(MarkdownRendererImpl).toSelf().inSingletonScope();
        container.bind(MarkdownRenderer).toService(MarkdownRendererImpl);
        renderer = container.get<MarkdownRenderer>(MarkdownRenderer);
    });

    after(() => {
        restoreJSDOM();
    });

    function renderImage(markdown: string): HTMLImageElement {
        const { element } = renderer.render(new MarkdownStringImpl(markdown));
        const image = element.querySelector('img');
        expect(image, `image rendered for '${markdown}'`).to.not.be.null;
        return image!;
    }

    it('applies the width and height of an image sizing suffix', () => {
        const image = renderImage('![Jane](https://avatars.example.com/u/1|width=20,height=20)');
        expect(image.getAttribute('src')).to.equal('https://avatars.example.com/u/1');
        expect(image.getAttribute('width')).to.equal('20');
        expect(image.getAttribute('height')).to.equal('20');
    });

    it('applies a suffix that sets only one dimension', () => {
        const image = renderImage('![Jane](https://avatars.example.com/u/1|width=20)');
        expect(image.getAttribute('src')).to.equal('https://avatars.example.com/u/1');
        expect(image.getAttribute('width')).to.equal('20');
        expect(image.hasAttribute('height')).to.be.false;
    });

    // markdown-it percent-encodes the link destination, so a pipe it keeps shows up as `%7C`.
    it('keeps a literal pipe that is not a well-formed sizing suffix', () => {
        const image = renderImage('![Jane](https://avatars.example.com/u/1|v=2)');
        expect(image.getAttribute('src')).to.equal('https://avatars.example.com/u/1%7Cv=2');
        expect(image.hasAttribute('width')).to.be.false;
    });

    it('ignores a non-numeric dimension', () => {
        const image = renderImage('![Jane](https://avatars.example.com/u/1|width=20px)');
        expect(image.getAttribute('src')).to.equal('https://avatars.example.com/u/1%7Cwidth=20px');
        expect(image.hasAttribute('width')).to.be.false;
    });

    it('renders an image without a suffix unchanged', () => {
        const image = renderImage('![Jane](https://avatars.example.com/u/1)');
        expect(image.getAttribute('src')).to.equal('https://avatars.example.com/u/1');
        expect(image.hasAttribute('width')).to.be.false;
    });
});
