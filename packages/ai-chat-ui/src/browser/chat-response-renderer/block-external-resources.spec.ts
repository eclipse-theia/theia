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

import { expect } from 'chai';
import { blockExternalResources, BLOCKED_RESOURCE_CLASS, restoreBlockedResource } from './block-external-resources';

disableJSDOM();

describe('blockExternalResources', () => {
    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    const createRoot = (html: string): HTMLElement => {
        const root = document.createElement('div');
        root.innerHTML = html;
        blockExternalResources(root);
        return root;
    };

    it('replaces an external image with a placeholder that shows the URL', () => {
        const root = createRoot('<img src="https://evil.com/x.gif">');

        const placeholder = root.querySelector(`.${BLOCKED_RESOURCE_CLASS}`) as HTMLElement;
        expect(placeholder).to.exist;
        expect(root.querySelector('img')).to.be.null;
        expect(placeholder.textContent).to.contain('https://evil.com/x.gif');
    });

    it('preserves data images', () => {
        const root = createRoot('<img src="data:image/png;base64,AAA">');

        expect(root.querySelector(`.${BLOCKED_RESOURCE_CLASS}`)).to.be.null;
        expect(root.querySelector('img')?.getAttribute('src')).to.equal('data:image/png;base64,AAA');
    });

    it('preserves images without a source', () => {
        const root = createRoot('<img><img src="">');

        expect(root.querySelector(`.${BLOCKED_RESOURCE_CLASS}`)).to.be.null;
        expect(root.querySelectorAll('img')).to.have.length(2);
    });

    it('blocks external image srcset entries', () => {
        const root = createRoot('<img srcset="https://a.com/x 1x, https://b.com/y 2x">');

        expect(root.querySelector(`.${BLOCKED_RESOURCE_CLASS}`)).to.exist;
        expect(root.querySelector('img')).to.be.null;
    });

    it('lists all blocked srcset entries', () => {
        const root = createRoot('<img srcset="https://a.com/x 1x,https://b.com/y 2x, https://c.com/z 100w">');

        const placeholder = root.querySelector(`.${BLOCKED_RESOURCE_CLASS}`) as HTMLElement;
        expect(placeholder).to.exist;
        expect(placeholder.textContent).to.contain('https://a.com/x');
        expect(placeholder.textContent).to.contain('https://b.com/y');
        expect(placeholder.textContent).to.contain('https://c.com/z');
        expect(placeholder.textContent).to.contain('3 resources will be enabled');
    });

    it('preserves data image srcset entries', () => {
        const root = createRoot('<img srcset="data:image/png;base64,AAA 1x">');

        expect(root.querySelector(`.${BLOCKED_RESOURCE_CLASS}`)).to.be.null;
        expect(root.querySelector('img')?.getAttribute('srcset')).to.equal('data:image/png;base64,AAA 1x');
    });

    it('lists only external srcset entries when mixed with data entries', () => {
        const root = createRoot('<img srcset="data:image/png;base64,AAA 1x,https://evil.com/x.png 2x">');

        const placeholder = root.querySelector(`.${BLOCKED_RESOURCE_CLASS}`) as HTMLElement;
        expect(placeholder).to.exist;
        expect(placeholder.textContent).to.contain('https://evil.com/x.png');
        expect(placeholder.textContent).not.to.contain('data:image/png;base64,AAA');
    });

    it('blocks external picture sources while preserving safe fallback images', () => {
        const root = createRoot('<picture><source srcset="https://x"><img src="data:image/png;base64,AAA"></picture>');

        expect(root.querySelector(`.${BLOCKED_RESOURCE_CLASS}`)).to.exist;
        expect(root.querySelector('source')).to.be.null;
        expect(root.querySelector('img')?.getAttribute('src')).to.equal('data:image/png;base64,AAA');
    });

    it('blocks external video resources', () => {
        const root = createRoot('<video src="https://x" poster="https://y"></video>');

        expect(root.querySelector(`.${BLOCKED_RESOURCE_CLASS}`)).to.exist;
        expect(root.querySelector('video')).to.be.null;
    });

    it('blocks external audio resources', () => {
        const root = createRoot('<audio src="https://x"></audio>');

        expect(root.querySelector(`.${BLOCKED_RESOURCE_CLASS}`)).to.exist;
        expect(root.querySelector('audio')).to.be.null;
    });

    it('blocks SVG image resources', () => {
        const root = createRoot('<svg><image href="https://evil.com/x.png"></image></svg>');

        const placeholder = root.querySelector(`.${BLOCKED_RESOURCE_CLASS}`) as HTMLElement;
        expect(placeholder).to.exist;
        expect(placeholder.textContent).to.contain('https://evil.com/x.png');
        expect(root.querySelector('image')).to.be.null;
    });

    it('blocks SVG use resources', () => {
        const root = createRoot('<svg><use xlink:href="https://evil.com/icons.svg#icon"></use></svg>');

        const placeholder = root.querySelector(`.${BLOCKED_RESOURCE_CLASS}`) as HTMLElement;
        expect(placeholder).to.exist;
        expect(placeholder.textContent).to.contain('https://evil.com/icons.svg#icon');
        expect(root.querySelector('use')).to.be.null;
    });

    it('blocks SVG filter image resources', () => {
        const root = createRoot('<svg><filter><feImage href="https://evil.com/filter.png"></feImage></filter></svg>');

        const placeholder = root.querySelector(`.${BLOCKED_RESOURCE_CLASS}`) as HTMLElement;
        expect(placeholder).to.exist;
        expect(placeholder.textContent).to.contain('https://evil.com/filter.png');
        expect(root.querySelector('feImage')).to.be.null;
    });

    it('blocks SVG filter image resources using xlink:href', () => {
        const root = createRoot('<svg><filter><feImage xlink:href="https://evil.com/filter.png"></feImage></filter></svg>');

        const placeholder = root.querySelector(`.${BLOCKED_RESOURCE_CLASS}`) as HTMLElement;
        expect(placeholder).to.exist;
        expect(placeholder.textContent).to.contain('https://evil.com/filter.png');
        expect(root.querySelector('feImage')).to.be.null;
    });

    it('preserves data SVG filter image resources', () => {
        const root = createRoot('<svg><filter><feImage href="data:image/png;base64,AAA"></feImage></filter></svg>');

        expect(root.querySelector(`.${BLOCKED_RESOURCE_CLASS}`)).to.be.null;
        expect(root.querySelector('feImage')?.getAttribute('href')).to.equal('data:image/png;base64,AAA');
    });

    it('blocks object and embed resources', () => {
        const root = createRoot('<object data="https://evil.com/object.svg"></object><embed src="https://evil.com/embed.svg">');

        expect(root.querySelectorAll(`.${BLOCKED_RESOURCE_CLASS}`)).to.have.length(2);
        expect(root.querySelector('object')).to.be.null;
        expect(root.querySelector('embed')).to.be.null;
    });

    it('shows all resources that will be enabled by allowing blocked content', () => {
        const root = createRoot('<video src="https://evil.com/video.mp4" poster="https://evil.com/poster.png"></video>');

        const placeholder = root.querySelector(`.${BLOCKED_RESOURCE_CLASS}`) as HTMLElement;
        expect(placeholder).to.exist;
        expect(placeholder.textContent).to.contain('https://evil.com/video.mp4');
        expect(placeholder.textContent).to.contain('https://evil.com/poster.png');
        expect(placeholder.textContent).to.contain('2 resources will be enabled');
    });

    it('blocks iframes unconditionally', () => {
        const root = createRoot('<iframe src="https://x"></iframe>');

        expect(root.querySelector(`.${BLOCKED_RESOURCE_CLASS}`)).to.exist;
        expect(root.querySelector('iframe')).to.be.null;
    });

    it('blocks inline iframe content', () => {
        const root = createRoot('<iframe srcdoc="&lt;p&gt;hi&lt;/p&gt;"></iframe>');

        const placeholder = root.querySelector(`.${BLOCKED_RESOURCE_CLASS}`) as HTMLElement;
        expect(placeholder).to.exist;
        expect(placeholder.textContent).to.contain('(inline external content)');
    });

    it('wraps elements with external CSS URLs and preserves safe style declarations', () => {
        const root = createRoot('<div style="background-image: url(https://x); color: red">content</div>');

        const placeholder = root.querySelector(`.${BLOCKED_RESOURCE_CLASS}`) as HTMLElement;
        const div = root.querySelector('div');
        expect(placeholder).to.exist;
        expect(placeholder.textContent).to.contain('https://x');
        expect(div).to.exist;
        expect(div?.style.backgroundImage).to.equal('');
        expect(div?.style.color).to.equal('red');
    });

    it('blocks external CSS image-set resources and preserves safe style declarations', () => {
        const root = document.createElement('div');
        const div = document.createElement('div');
        div.setAttribute('style', 'color: red');
        const getAttribute = div.getAttribute.bind(div);
        div.getAttribute = (qualifiedName: string) => qualifiedName === 'style'
            ? 'background-image: image-set("https://evil.com/x.png" 1x); color: red'
            : getAttribute(qualifiedName);
        div.textContent = 'content';
        root.appendChild(div);
        blockExternalResources(root);

        const placeholder = root.querySelector(`.${BLOCKED_RESOURCE_CLASS}`) as HTMLElement;
        const safeDiv = root.querySelector('div');
        expect(placeholder).to.exist;
        expect(placeholder.textContent).to.contain('https://evil.com/x.png');
        expect(safeDiv).to.exist;
        expect(safeDiv?.getAttribute('style')).to.equal('color: red');
    });

    it('preserves data CSS URLs', () => {
        const root = createRoot('<div style="background-image: url(data:image/png;base64,AA)">content</div>');

        expect(root.querySelector(`.${BLOCKED_RESOURCE_CLASS}`)).to.be.null;
        expect(root.querySelector('div')?.style.backgroundImage).to.contain('data:image/png;base64,AA');
    });

    it('uses text content for displayed URLs', () => {
        const root = createRoot('<img src="https://evil.com/<script>alert(1)</script>.gif">');

        const placeholder = root.querySelector(`.${BLOCKED_RESOURCE_CLASS}`) as HTMLElement;
        expect(placeholder).to.exist;
        expect(placeholder.querySelector('script')).to.be.null;
        expect(placeholder.textContent).to.contain('https://evil.com/<script>alert(1)</script>.gif');
    });

    it('stores blocked resources outside forgeable DOM attributes', () => {
        const root = createRoot('<img src="https://evil.com/x.gif" alt="tracker">');

        const placeholder = root.querySelector(`.${BLOCKED_RESOURCE_CLASS}`) as HTMLElement;
        expect(placeholder.dataset.blockedHtml).to.be.undefined;

        const restored = restoreBlockedResource(placeholder);
        expect(restored?.tagName).to.equal('IMG');
        expect(restored?.getAttribute('src')).to.equal('https://evil.com/x.gif');
        expect(restored?.getAttribute('alt')).to.equal('tracker');
        expect(restoreBlockedResource(placeholder)).to.be.undefined;
    });
});
