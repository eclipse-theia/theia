// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
import * as React from '@theia/core/shared/react';
import {
    AiConfigurationCategory, AiConfigurationRenderContext, AiConfigurationSelection
} from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { AiConfigurationDetailWidget } from './ai-configuration-detail-widget';

disableJSDOM();

/**
 * Exercises the selection → detail dispatch logic of {@link AiConfigurationDetailWidget#renderBody}
 * in isolation. `renderBody` only consumes its arguments (not the injected registry/selection model),
 * so we invoke it on a prototype instance without spinning up the DI container or a DOM.
 */
describe('AiConfigurationDetailWidget dispatch', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const widget = Object.create(AiConfigurationDetailWidget.prototype) as any;
    const ctx = {} as AiConfigurationRenderContext;

    function category(kind: 'single-page' | 'collection', renderer: AiConfigurationCategory['renderer']): AiConfigurationCategory {
        return { id: 'c', label: 'C', iconClass: 'codicon codicon-gear', kind, renderer };
    }

    function renderBody(cat: AiConfigurationCategory, selection: AiConfigurationSelection): React.ReactNode {
        return widget.renderBody(cat, selection, ctx);
    }

    // Category-level views are wrapped as `<>{categoryHeader}{content}</>`; the content is the second child.
    // Item-detail views are returned as-is (they render their own header).
    function contentOf(cat: AiConfigurationCategory, selection: AiConfigurationSelection): React.ReactNode {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (renderBody(cat, selection) as any).props.children[1];
    }

    it('renders the item detail as-is when an item is selected and the renderer supports it', () => {
        const cat = category('collection', {
            renderItemDetail: itemId => `detail:${itemId}`,
            renderOverview: () => 'overview'
        });
        expect(renderBody(cat, { categoryId: 'c', itemId: 'a' })).to.equal('detail:a');
    });

    it('falls back to the overview when an item is selected but the renderer has no item detail', () => {
        const cat = category('collection', { renderOverview: () => 'overview' });
        expect(contentOf(cat, { categoryId: 'c', itemId: 'a' })).to.equal('overview');
    });

    it('renders the overview for a collection without an item selection', () => {
        const cat = category('collection', { renderOverview: () => 'overview', renderPage: () => 'page' });
        expect(contentOf(cat, { categoryId: 'c' })).to.equal('overview');
    });

    it('renders the page for a single-page category', () => {
        const cat = category('single-page', { renderPage: () => 'page' });
        expect(contentOf(cat, { categoryId: 'c' })).to.equal('page');
    });

    it('shows the coming-soon placeholder when the renderer provides no applicable method', () => {
        const cat = category('single-page', {});
        // The placeholder is a <div> element rather than a plain renderer return value.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((contentOf(cat, { categoryId: 'c' }) as any).type).to.equal('div');
    });

    it('prefixes category-level views with the shared category header', () => {
        const cat = category('single-page', { renderPage: () => 'page' });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const header = (renderBody(cat, { categoryId: 'c' }) as any).props.children[0];
        expect(header.props.className).to.contain('ai-configuration-category-header');
    });
});

/**
 * Pins the scrolling arithmetic of {@link AiConfigurationDetailWidget#centerInBody} and, more importantly,
 * that it writes only the scroll container.
 *
 * The predecessor was `element.scrollIntoView({ block: 'center' })`, which also scrolls every scrollable
 * ancestor — and `overflow: hidden` does not prevent programmatic scrolling, so it shifted the containers
 * above the widget, taking the menu bar out of view. JSDOM performs no layout, so the rects and
 * `clientHeight` are stubbed; it also does not implement `scrollIntoView`, so reverting to it fails every
 * assertion here (verified by patching the method back).
 */
describe('AiConfigurationDetailWidget centerInBody', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const widget = Object.create(AiConfigurationDetailWidget.prototype) as any;

    /** An element whose `scrollTop` is a plain writable property, since JSDOM would otherwise clamp it to 0. */
    function scrollable(rect: { top: number; height: number }, clientHeight?: number): HTMLElement {
        const element = document.createElement('div');
        Object.defineProperty(element, 'scrollTop', { value: 0, writable: true });
        if (clientHeight !== undefined) {
            Object.defineProperty(element, 'clientHeight', { value: clientHeight });
        }
        element.getBoundingClientRect = () => ({ top: rect.top, height: rect.height }) as DOMRect;
        return element;
    }

    /** A body scrolled within an ancestor, so the test can assert the ancestor is left alone. */
    function hierarchy(elementTop: number): { ancestor: HTMLElement; body: HTMLElement; element: HTMLElement } {
        const ancestor = scrollable({ top: 0, height: 600 }, 600);
        const body = scrollable({ top: 100, height: 400 }, 400);
        const element = scrollable({ top: elementTop, height: 40 });
        ancestor.appendChild(body);
        body.appendChild(element);
        return { ancestor, body, element };
    }

    it('scrolls the container so the row is vertically centred', () => {
        const { body, element } = hierarchy(500);
        // Row sits 400px below the body's top; centring it in a 400px viewport puts it at (400 - 40) / 2 = 180.
        widget.centerInBody(body, element);
        expect(body.scrollTop).to.equal(220);
    });

    it('leaves the scroll position alone when the row is already centred', () => {
        const { body, element } = hierarchy(280);
        widget.centerInBody(body, element);
        expect(body.scrollTop).to.equal(0);
    });

    it('scrolls back up for a row above the centre', () => {
        const { body, element } = hierarchy(120);
        // 20px below the body's top, so it has to scroll up by 160 to reach the centre.
        body.scrollTop = 300;
        widget.centerInBody(body, element);
        expect(body.scrollTop).to.equal(140);
    });

    it('never scrolls an ancestor of the container', () => {
        const { ancestor, body, element } = hierarchy(500);
        widget.centerInBody(body, element);
        expect(body.scrollTop, 'the container itself should have scrolled').to.not.equal(0);
        expect(ancestor.scrollTop, 'scrolling an ancestor shifts the whole shell').to.equal(0);
    });
});
