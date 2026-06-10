// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
import {
    renderStickyComposerActivityStack,
    renderStickyComposerChangesPill,
    type StickyComposerChangedFileView,
} from './qaap-sticky-composer-activity-stack';

describe('qaap-sticky-composer-activity-stack', () => {

    describe('renderStickyComposerChangesPill', () => {
        let disableJSDOM: () => void;

        before(() => {
            disableJSDOM = enableJSDOM();
        });

        after(() => {
            disableJSDOM();
        });

        it('renders a Changes pill that opens review on click', () => {
            let reviewCalled = false;
            const files: StickyComposerChangedFileView[] = [
                { path: 'src/app.ts', kind: 'edited', added: 4, removed: 1 },
                { path: 'docs/readme.md', kind: 'created' },
            ];

            const host = renderStickyComposerChangesPill({
                changedFiles: files,
                diffStats: { added: 5, removed: 1 },
                onReview: () => { reviewCalled = true; },
            });
            expect(host).to.exist;
            document.body.append(host!);

            expect(host!.className).to.equal('theia-mobile-sticky-composer-changes-pill-host');
            const pill = host!.querySelector<HTMLButtonElement>('.theia-mobile-sticky-composer-changes-pill');
            expect(pill).to.exist;
            expect(pill!.querySelector('.theia-mobile-sticky-composer-changes-pill-label')?.textContent).to.equal('Changes');
            expect(pill!.querySelector('.theia-mobile-agent-diff-stat.theia-mod-added')?.textContent).to.equal('+5');
            expect(pill!.querySelector('.theia-mobile-agent-diff-stat.theia-mod-removed')?.textContent).to.equal('-1');
            expect(host!.querySelector('.theia-mobile-sticky-composer-changed-file-row')).to.equal(null);

            pill!.click();
            expect(reviewCalled).to.equal(true);
        });

        it('shows the Changes pill for stats-only activity before per-file rows are available', () => {
            const host = renderStickyComposerChangesPill({
                diffStats: { added: 12, removed: 3 },
                onReview: () => undefined,
            });
            document.body.append(host!);

            expect(host!.querySelector('.theia-mobile-sticky-composer-changes-pill')).to.exist;
        });

        it('renders Stop beside the Changes pill while the agent is working', () => {
            const host = renderStickyComposerChangesPill({
                diffStats: { added: 2, removed: 0 },
                agentWorking: true,
                onStop: () => undefined,
                onReview: () => undefined,
            });
            document.body.append(host!);

            expect(host!.querySelector('.theia-mobile-sticky-composer-changes-pill')).to.exist;
            expect(host!.querySelector('.theia-mobile-sticky-composer-activity-stop')?.textContent).to.equal('Stop');
        });

        it('renders the commit split-button beside the Changes pill and fires the workflow actions', () => {
            const actions: string[] = [];
            const host = renderStickyComposerChangesPill({
                diffStats: { added: 4, removed: 2 },
                onReview: () => undefined,
                onCommitAction: action => { actions.push(action); },
            });
            document.body.append(host!);

            const commitBtn = host!.querySelector<HTMLButtonElement>('.theia-mobile-sticky-composer-commit-btn');
            expect(commitBtn).to.exist;
            expect(commitBtn!.textContent).to.equal('Commit & Push');
            commitBtn!.click();
            expect(actions).to.deep.equal(['commit-push']);

            const menuBtn = host!.querySelector<HTMLButtonElement>('.theia-mobile-sticky-composer-commit-menu');
            const dropdown = host!.querySelector<HTMLElement>('.theia-mobile-sticky-composer-commit-dropdown');
            expect(menuBtn).to.exist;
            expect(dropdown!.hidden).to.equal(true);
            menuBtn!.click();
            expect(dropdown!.hidden).to.equal(false);
            expect(menuBtn!.getAttribute('aria-expanded')).to.equal('true');

            const items = Array.from(dropdown!.querySelectorAll<HTMLButtonElement>('.theia-mobile-sticky-composer-commit-dropdown-item'));
            expect(items.map(item => item.textContent)).to.deep.equal([
                'Create Branch & Commit',
                'Create Branch, Commit & Push',
                'Commit',
                'Commit & Create PR',
            ]);
            items[0].click();
            expect(actions).to.deep.equal(['commit-push', 'create-branch-commit']);
            expect(dropdown!.hidden).to.equal(true);
        });

        it('marks the commit group busy (border beam) and disables its buttons while committing', () => {
            const host = renderStickyComposerChangesPill({
                diffStats: { added: 4, removed: 2 },
                onReview: () => undefined,
                onCommitAction: () => undefined,
                commitBusy: true,
            });
            document.body.append(host!);

            const group = host!.querySelector<HTMLElement>('.theia-mobile-sticky-composer-commit-group');
            expect(group).to.exist;
            expect(group!.classList.contains('theia-mod-busy')).to.equal(true);
            expect(host!.querySelector<HTMLButtonElement>('.theia-mobile-sticky-composer-commit-btn')!.disabled).to.equal(true);
            expect(host!.querySelector<HTMLButtonElement>('.theia-mobile-sticky-composer-commit-menu')!.disabled).to.equal(true);
        });

        it('does not render the commit split-button without an onCommitAction handler', () => {
            const host = renderStickyComposerChangesPill({
                diffStats: { added: 1, removed: 0 },
                onReview: () => undefined,
            });
            document.body.append(host!);

            expect(host!.querySelector('.theia-mobile-sticky-composer-commit-group')).to.equal(null);
        });
    });

    describe('renderStickyComposerActivityStack queue', () => {
        let disableJSDOM: () => void;

        before(() => {
            disableJSDOM = enableJSDOM();
        });

        after(() => {
            disableJSDOM();
        });

        it('keeps the queue stack separate from the Changes pill', () => {
            const stack = renderStickyComposerActivityStack({
                queueEntries: [{ draft: 'follow up' }],
                changedFiles: [{ path: 'src/main.ts', kind: 'edited', added: 3, removed: 1 }],
                diffStats: { added: 3, removed: 1 },
            });
            expect(stack).to.exist;
            expect(stack!.querySelector('.theia-mobile-sticky-composer-activity-section.theia-mod-queue')).to.exist;
            expect(stack!.querySelector('.theia-mobile-sticky-composer-changes-pill')).to.equal(null);
        });
    });
});
