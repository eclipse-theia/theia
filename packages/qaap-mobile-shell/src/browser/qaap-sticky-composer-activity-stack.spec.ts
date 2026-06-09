// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
import {
    renderStickyComposerActivityStack,
    type StickyComposerChangedFileView,
} from './qaap-sticky-composer-activity-stack';

describe('qaap-sticky-composer-activity-stack', () => {

    describe('renderStickyComposerActivityStack changed files', () => {
        let disableJSDOM: () => void;

        before(() => {
            disableJSDOM = enableJSDOM();
            const style = document.createElement('style');
            style.textContent = `
                .theia-mobile-projects-sticky-composer-context-body {
                    display: flex;
                }
                .theia-mobile-projects-sticky-composer-context-body[hidden] {
                    display: none !important;
                }
            `;
            document.head.append(style);
        });

        after(() => {
            disableJSDOM();
        });

        it('renders changed files as a composer accordion with document rows', () => {
            const files: StickyComposerChangedFileView[] = [
                { path: 'src/app.ts', kind: 'edited', added: 4, removed: 1 },
                { path: 'docs/readme.md', kind: 'created' },
            ];

            const stack = renderStickyComposerActivityStack({
                changedFiles: files,
                diffStats: { added: 4, removed: 1 },
                onReview: () => undefined,
            });
            expect(stack).to.exist;
            document.body.append(stack!);

            const strip = stack!.querySelector('.theia-mobile-projects-sticky-composer-context-strip.theia-mod-changed-files');
            const toggle = stack!.querySelector<HTMLButtonElement>(
                '.theia-mobile-projects-sticky-composer-context-files-toggle',
            );
            const rows = stack!.querySelectorAll('.theia-mobile-sticky-composer-changed-file-row');
            const review = stack!.querySelector('.theia-mobile-sticky-composer-activity-review');
            const undoAll = stack!.querySelector('.theia-mobile-sticky-composer-activity-bulk-action.theia-mod-undo');
            const keepAll = stack!.querySelector('.theia-mobile-sticky-composer-activity-bulk-action.theia-mod-keep');

            expect(strip).to.exist;
            expect(toggle).to.exist;
            expect(rows.length).to.equal(2);
            expect(review).to.exist;
            expect(undoAll).to.equal(null);
            expect(keepAll).to.equal(null);
            expect(rows[0].querySelector('.theia-mobile-sticky-composer-changed-file-name')?.textContent).to.equal('app.ts');
            expect(rows[0].querySelector('.theia-mobile-agent-diff-stat.theia-mod-added')?.textContent).to.equal('+4');
            expect(rows[1].querySelector('.theia-mobile-agent-diff-stat.theia-mod-added')?.textContent).to.equal('+1');
        });

        it('allows collapsing stats-only headers before per-file rows are available', () => {
            let expanded = true;
            const stack = renderStickyComposerActivityStack({
                diffStats: { added: 12, removed: 3 },
                agentWorking: true,
                filesExpanded: expanded,
                onFilesExpandedChange: value => { expanded = value; },
            });
            document.body.append(stack!);

            const toggle = stack!.querySelector<HTMLButtonElement>(
                '.theia-mobile-projects-sticky-composer-context-files-toggle',
            );
            const strip = stack!.querySelector<HTMLElement>(
                '.theia-mobile-projects-sticky-composer-context-strip.theia-mod-changed-files',
            );

            expect(toggle).to.exist;
            expect(toggle!.getAttribute('aria-expanded')).to.equal('true');

            toggle!.click();

            expect(expanded).to.equal(false);
            expect(toggle!.classList.contains('theia-mod-collapsed')).to.equal(true);
            expect(strip!.classList.contains('theia-mod-files-collapsed')).to.equal(true);
        });

        it('keeps changed files visible while the agent is idle when diff stats exist', () => {
            const stack = renderStickyComposerActivityStack({
                changedFiles: [{ path: 'src/main.ts', kind: 'edited', added: 3, removed: 1 }],
                diffStats: { added: 3, removed: 1 },
                agentWorking: false,
            });
            expect(stack).to.exist;
            expect(stack!.querySelector('.theia-mobile-projects-sticky-composer-context-strip.theia-mod-changed-files')).to.exist;
        });

        it('renders Undo All and Keep All when bulk callbacks are provided', () => {
            let undoCalled = false;
            let keepCalled = false;
            const stack = renderStickyComposerActivityStack({
                changedFiles: [{ path: 'lib/util.ts', kind: 'edited', added: 2, removed: 0 }],
                onUndoAll: () => { undoCalled = true; },
                onKeepAll: () => { keepCalled = true; },
            });
            document.body.append(stack!);

            const undoAll = stack!.querySelector<HTMLButtonElement>(
                '.theia-mobile-sticky-composer-activity-bulk-action.theia-mod-undo',
            );
            const keepAll = stack!.querySelector<HTMLButtonElement>(
                '.theia-mobile-sticky-composer-activity-bulk-action.theia-mod-keep',
            );

            expect(undoAll?.textContent).to.equal('Undo All');
            expect(keepAll?.textContent).to.equal('Keep All');

            undoAll!.click();
            keepAll!.click();
            expect(undoCalled).to.equal(true);
            expect(keepCalled).to.equal(true);
        });

        it('collapses changed file rows when the header toggle is clicked', () => {
            const files: StickyComposerChangedFileView[] = [
                { path: 'lib/util.ts', kind: 'edited', added: 2, removed: 0 },
            ];
            let expanded = true;

            const stack = renderStickyComposerActivityStack({
                changedFiles: files,
                filesExpanded: expanded,
                onFilesExpandedChange: value => { expanded = value; },
            });
            document.body.append(stack!);

            const toggle = stack!.querySelector<HTMLButtonElement>(
                '.theia-mobile-projects-sticky-composer-context-files-toggle',
            );
            const body = stack!.querySelector<HTMLElement>(
                '.theia-mobile-projects-sticky-composer-context-body',
            );
            const strip = stack!.querySelector<HTMLElement>(
                '.theia-mobile-projects-sticky-composer-context-strip.theia-mod-changed-files',
            );

            expect(toggle!.getAttribute('aria-expanded')).to.equal('true');
            expect(body!.hidden).to.equal(false);

            toggle!.click();

            expect(expanded).to.equal(false);
            expect(toggle!.getAttribute('aria-expanded')).to.equal('false');
            expect(toggle!.classList.contains('theia-mod-collapsed')).to.equal(true);
            expect(strip!.classList.contains('theia-mod-files-collapsed')).to.equal(true);
            expect(body!.hidden).to.equal(true);
            expect(window.getComputedStyle(body!).display).to.equal('none');
        });
    });
});
