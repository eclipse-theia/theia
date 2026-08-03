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

import { expect } from 'chai';
import { MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { ScmHistoryItem } from './scm-provider';
import { HistoryGraphEntry } from './scm-history-graph-model';
import { buildHtmlTooltip, HistoryTooltipActions } from './scm-history-graph-tooltip';

disableJSDOM();

function makeEntry(item: Partial<ScmHistoryItem>): HistoryGraphEntry {
    return {
        item: {
            id: '1a56ba96fdc9b6df3a230df7b44e22e5785e3abd',
            subject: 'fix something',
            parentIds: [],
            ...item,
        },
        graphRow: { lane: 0, color: 0, topColor: 0, edges: [], hasContinuation: false, hasTopLine: false },
        isCurrent: false,
    };
}

const markdownRenderer = {
    render: () => ({ element: document.createElement('div'), dispose: () => { } })
} as unknown as MarkdownRenderer;

describe('buildHtmlTooltip', () => {
    let restoreJSDOM: () => void;

    before(() => {
        restoreJSDOM = enableJSDOM();
    });

    after(() => {
        restoreJSDOM();
    });

    it('renders the author as a bold mailto link when the email is known', () => {
        const tooltip = buildHtmlTooltip(makeEntry({ author: 'Jane Doe', authorEmail: 'jane@example.com', timestamp: 1000 }), markdownRenderer);
        const link = tooltip.querySelector('a[href="mailto:jane@example.com"]');
        expect(link, 'mailto link').to.not.be.null;
        expect(link!.textContent).to.contain('Jane Doe');
        expect(link!.querySelector('strong'), 'bold author').to.not.be.null;
    });

    it('renders a plain bold author when no email is known', () => {
        const tooltip = buildHtmlTooltip(makeEntry({ author: 'Jane Doe', timestamp: 1000 }), markdownRenderer);
        expect(tooltip.querySelector('a[href^="mailto:"]')).to.be.null;
        const strong = tooltip.querySelector('.scm-history-tooltip-header strong');
        expect(strong).to.not.be.null;
        expect(strong!.textContent).to.equal('Jane Doe');
    });

    it('renders the author avatar image when authorIcon is a URL', () => {
        const tooltip = buildHtmlTooltip(makeEntry({ author: 'Jane Doe', authorIcon: 'https://avatars.example.com/u/1' }), markdownRenderer);
        const img = tooltip.querySelector('img.scm-history-tooltip-avatar') as HTMLImageElement;
        expect(img, 'avatar image').to.not.be.null;
        expect(img.src).to.equal('https://avatars.example.com/u/1');
    });

    it('falls back to the account icon without an avatar', () => {
        const tooltip = buildHtmlTooltip(makeEntry({ author: 'Jane Doe' }), markdownRenderer);
        expect(tooltip.querySelector('img.scm-history-tooltip-avatar')).to.be.null;
        expect(tooltip.querySelector('.scm-history-tooltip-header .codicon-account')).to.not.be.null;
    });

    it('renders an Open Commit action with the short hash', () => {
        let opened = 0;
        const actions: HistoryTooltipActions = { openCommit: () => { opened++; } };
        const tooltip = buildHtmlTooltip(makeEntry({ displayId: '1a56ba9' }), markdownRenderer, undefined, actions);
        const action = tooltip.querySelector('[title="Open Commit"]') as HTMLElement;
        expect(action, 'open commit action').to.not.be.null;
        expect(action.textContent).to.contain('1a56ba9');
        action.click();
        expect(opened).to.equal(1);
    });

    it('renders a Copy Commit Hash action', () => {
        let copied = 0;
        const actions: HistoryTooltipActions = { copyCommitHash: () => { copied++; } };
        const tooltip = buildHtmlTooltip(makeEntry({}), markdownRenderer, undefined, actions);
        const action = tooltip.querySelector('[title="Copy Commit Hash"]') as HTMLElement;
        expect(action, 'copy hash action').to.not.be.null;
        action.click();
        expect(copied).to.equal(1);
    });

    it('shows the short hash as plain text when no actions are given', () => {
        const tooltip = buildHtmlTooltip(makeEntry({ displayId: '1a56ba9' }), markdownRenderer);
        expect(tooltip.querySelector('[title="Open Commit"]')).to.be.null;
        expect(tooltip.querySelector('[title="Copy Commit Hash"]')).to.be.null;
        expect(tooltip.textContent).to.contain('1a56ba9');
    });
});
