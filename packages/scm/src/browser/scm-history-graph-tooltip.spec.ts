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
import { MarkdownString, MarkdownStringImpl } from '@theia/core/lib/common/markdown-rendering/markdown-string';
import { OpenerService } from '@theia/core/lib/browser/opener-service';
import { markMarkdownLinksWired } from '@theia/core/lib/browser/markdown-rendering/markdown-link-handler';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import URI from '@theia/core/lib/common/uri';
import { ScmHistoryItem } from './scm-provider';
import { HistoryGraphEntry } from './scm-history-graph-model';
import { buildHtmlTooltip, buildProviderTooltip, HistoryTooltipActions } from './scm-history-graph-tooltip';

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

describe('buildProviderTooltip', () => {
    let restoreJSDOM: () => void;
    let opened: string[];
    let toDispose: DisposableCollection;

    /** Renders the markdown value as HTML, so that the wiring of the resulting links can be asserted. */
    const htmlRenderer = {
        render: (markdown: MarkdownString) => {
            const element = document.createElement('div');
            element.innerHTML = markdown.value;
            return { element, dispose: () => { } };
        }
    } as unknown as MarkdownRenderer;

    const openerService = {
        getOpener: (uri: URI) => Promise.resolve({
            canHandle: () => 1,
            open: () => {
                // decoded, as `HttpOpenHandler` does when opening the target externally
                opened.push(uri.toString(true));
                return Promise.resolve(undefined);
            }
        })
    } as unknown as OpenerService;

    /** Clicks the anchor and waits for the asynchronous opener lookup to settle. */
    async function click(tooltip: HTMLElement, selector: string): Promise<void> {
        const anchor = tooltip.querySelector(selector) as HTMLElement;
        expect(anchor, selector).to.not.be.null;
        anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        await new Promise(resolve => setTimeout(resolve, 0));
    }

    before(() => {
        restoreJSDOM = enableJSDOM();
    });

    after(() => {
        restoreJSDOM();
    });

    beforeEach(() => {
        opened = [];
        toDispose = new DisposableCollection();
    });

    afterEach(() => {
        toDispose.dispose();
    });

    it('renders each section in order', () => {
        const tooltip = buildProviderTooltip(
            [new MarkdownStringImpl('<span>first</span>'), new MarkdownStringImpl('<span>second</span>')],
            htmlRenderer, openerService, toDispose)!;
        expect(tooltip, 'tooltip').to.not.be.undefined;
        expect(tooltip.textContent).to.equal('firstsecond');
    });

    // `vscode.git` ends its author and statistics sections with a horizontal rule of its own,
    // so adding separators here would render every boundary as a double line.
    it('adds no separators of its own between sections', () => {
        const tooltip = buildProviderTooltip(
            [new MarkdownStringImpl('<span>first</span><hr>'), new MarkdownStringImpl('<span>second</span>')],
            htmlRenderer, openerService, toDispose)!;
        expect(tooltip.querySelectorAll('hr').length, 'rules').to.equal(1);
    });

    it('renders a plain string tooltip', () => {
        const tooltip = buildProviderTooltip('just text', htmlRenderer, openerService, toDispose)!;
        expect(tooltip, 'tooltip').to.not.be.undefined;
        expect(tooltip.textContent).to.equal('just text');
    });

    it('returns undefined when the provider supplies no usable content', () => {
        expect(buildProviderTooltip('   ', htmlRenderer, openerService, toDispose)).to.be.undefined;
        expect(buildProviderTooltip([], htmlRenderer, openerService, toDispose)).to.be.undefined;
    });

    it('routes an author mailto link through the opener service', async () => {
        const tooltip = buildProviderTooltip(
            new MarkdownStringImpl('<a href="mailto:jane@example.com">Jane Doe</a>'), htmlRenderer, openerService, toDispose)!;
        await click(tooltip, 'a[href^="mailto:"]');
        expect(opened).to.deep.equal(['mailto:jane@example.com']);
    });

    it('executes a command link that the section trusts', async () => {
        const section = new MarkdownStringImpl('<a href="command:git.viewCommit">Open Commit</a>');
        section.isTrusted = { enabledCommands: ['git.viewCommit'] };
        const tooltip = buildProviderTooltip(section, htmlRenderer, openerService, toDispose)!;
        await click(tooltip, 'a[href^="command:"]');
        expect(opened).to.deep.equal(['command:git.viewCommit']);
    });

    it('blocks a command link that the section does not trust', async () => {
        const section = new MarkdownStringImpl('<a href="command:git.viewCommit">Open Commit</a>');
        section.isTrusted = { enabledCommands: ['git.copyContentToClipboard'] };
        const tooltip = buildProviderTooltip(section, htmlRenderer, openerService, toDispose)!;
        await click(tooltip, 'a[href^="command:"]');
        expect(opened).to.be.empty;
    });

    it('does not open a link twice when the renderer already wired it', async () => {
        // The Monaco-based renderer used at runtime routes link activation through the opener
        // service itself, so wiring a second handler on top would open every link twice.
        const wiringRenderer = {
            render: (markdown: MarkdownString) => {
                const element = document.createElement('div');
                element.innerHTML = markdown.value;
                markMarkdownLinksWired(element);
                element.addEventListener('click', event => {
                    event.preventDefault();
                    opened.push((event.target as HTMLElement).getAttribute('href')!);
                });
                return { element, dispose: () => { } };
            }
        } as unknown as MarkdownRenderer;

        const section = new MarkdownStringImpl('<a href="command:git.viewCommit">Open Commit</a>');
        section.isTrusted = { enabledCommands: ['git.viewCommit'] };
        const tooltip = buildProviderTooltip(section, wiringRenderer, openerService, toDispose)!;
        await click(tooltip, 'a[href^="command:"]');
        expect(opened).to.deep.equal(['command:git.viewCommit']);
    });

    it('does not let one section authorize another section\'s commands', async () => {
        const untrusted = new MarkdownStringImpl('<a id="untrusted" href="command:git.viewCommit">Open Commit</a>');
        const trusted = new MarkdownStringImpl('<a id="trusted" href="command:git.copyContentToClipboard">Copy</a>');
        trusted.isTrusted = { enabledCommands: ['git.copyContentToClipboard'] };
        const tooltip = buildProviderTooltip([untrusted, trusted], htmlRenderer, openerService, toDispose)!;

        await click(tooltip, 'a#untrusted');
        expect(opened, 'untrusted section').to.be.empty;
        await click(tooltip, 'a#trusted');
        expect(opened, 'trusted section').to.deep.equal(['command:git.copyContentToClipboard']);
    });
});
