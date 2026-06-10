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
