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
const disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});
import { expect } from 'chai';
import { sanitizeDiagram, splitMermaidSegments } from './mermaid-rendering';
disableJSDOM();

describe('sanitizeDiagram', () => {

    const sanitize = (body: string): string => sanitizeDiagram(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">${body}</svg>`);

    it('keeps HTML labels rendered inside foreignObject', () => {
        const out = sanitize('<g class="node"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml" class="nodeLabel">'
            + '<p>Frontend Extensions<br/>src/browser</p></div></foreignObject></g>');
        expect(out).to.match(/foreignObject/i);
        expect(out).to.contain('Frontend Extensions');
        expect(out).to.contain('src/browser');
    });

    it('removes scripts and event handlers', () => {
        const out = sanitize('<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">'
            + '<script>alert(1)</script><img src="data:," onerror="alert(2)"></div></foreignObject>');
        expect(out).to.not.match(/<script/i);
        expect(out).to.not.match(/onerror/i);
    });

    describe('blocks resources that would trigger a network request on render', () => {
        const url = 'https://attacker.test/p.png';
        const htmlLabel = (inner: string): string => `<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">${inner}</div></foreignObject>`;
        const cases: Array<{ name: string; body: string }> = [
            { name: 'HTML <img src>', body: htmlLabel(`<img src="${url}">`) },
            { name: 'SVG <image href>', body: `<image href="${url}"/>` },
            { name: '<input type=image>', body: htmlLabel(`<input type="image" src="${url}">`) },
            { name: '<video poster>', body: htmlLabel(`<video poster="${url}"></video>`) },
            { name: 'inline style background url()', body: htmlLabel(`<span style="background-image:url(${url})">x</span>`) },
            { name: '<style> css url()', body: `<style>.n{background:url("${url}")}</style>` },
            { name: '<style> css @import string', body: `<style>@import "${url}";</style>` },
            { name: '<style> css @import url()', body: `<style>@import url("${url}");</style>` },
            { name: '<style> css image-set()', body: `<style>.n{background-image:image-set("${url}" 1x)}</style>` },
            { name: 'inline style image-set()', body: htmlLabel(`<span style="background-image:image-set('${url}' 1x)">x</span>`) }
        ];
        cases.forEach(({ name, body }) => {
            it(name, () => {
                expect(sanitize(body)).to.not.match(/attacker\.test/);
            });
        });
    });

    it('keeps inline data: resources (no network request)', () => {
        const out = sanitize('<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">'
            + '<img src="data:image/png;base64,iVBOR"></div></foreignObject>');
        expect(out).to.contain('data:image/png');
    });

    it('keeps internal url(#id) references used by mermaid markers and gradients', () => {
        const out = sanitize('<path marker-end="url(#arrowhead)" fill="url(#grad)" stroke="#888"/><style>.n{fill:#ccc}</style>');
        expect(out).to.contain('url(#arrowhead)');
        expect(out).to.contain('url(#grad)');
        expect(out).to.contain('#ccc');
    });

    it('keeps anchor links, which navigate on click rather than auto-loading', () => {
        const out = sanitize('<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">'
            + '<a href="https://example.test/page">link</a></div></foreignObject>');
        expect(out).to.contain('https://example.test/page');
    });

});

describe('splitMermaidSegments', () => {

    it('returns a single markdown segment when there is no mermaid block', () => {
        const segments = splitMermaidSegments('# Title\n\nSome **markdown** text.');
        expect(segments).to.have.lengthOf(1);
        expect(segments[0].type).to.equal('markdown');
    });

    it('extracts a mermaid block and keeps the surrounding markdown', () => {
        const segments = splitMermaidSegments('Before\n\n```mermaid\ngraph TD; A-->B;\n```\n\nAfter');
        expect(segments.map(s => s.type)).to.deep.equal(['markdown', 'mermaid', 'markdown']);
        expect(segments[1].content).to.equal('graph TD; A-->B;');
        expect(segments[0].content).to.contain('Before');
        expect(segments[2].content).to.contain('After');
    });

    it('handles a mermaid block at the very start', () => {
        const segments = splitMermaidSegments('```mermaid\ngraph TD; A-->B;\n```');
        expect(segments).to.have.lengthOf(1);
        expect(segments[0].type).to.equal('mermaid');
        expect(segments[0].content).to.equal('graph TD; A-->B;');
    });

    it('extracts multiple mermaid blocks', () => {
        const segments = splitMermaidSegments('```mermaid\nA\n```\ntext\n```mermaid\nB\n```');
        expect(segments.map(s => s.type)).to.deep.equal(['mermaid', 'markdown', 'mermaid']);
        expect(segments[0].content).to.equal('A');
        expect(segments[2].content).to.equal('B');
    });

    it('leaves non-mermaid code fences inside the markdown segment', () => {
        const segments = splitMermaidSegments('```ts\nconst a = 1;\n```');
        expect(segments).to.have.lengthOf(1);
        expect(segments[0].type).to.equal('markdown');
        expect(segments[0].content).to.contain('const a = 1;');
    });

});
