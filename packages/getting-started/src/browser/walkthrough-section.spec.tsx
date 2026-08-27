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

import * as assert from 'assert';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';

let disableJSDOM = enableJSDOM();

import { createRoot, Root } from '@theia/core/shared/react-dom/client';
import { Emitter } from '@theia/core/lib/common/event';
import { MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { Disposable } from '@theia/core/lib/common/disposable';
import { ILogger } from '@theia/core/lib/common/logger';
import { ThemeType } from '@theia/core/lib/common/theme';
import { Walkthrough, WalkthroughStep } from '../common/walkthrough-types';
import { WalkthroughService } from './walkthrough-service';
import { WALKTHROUGH_LIST_LIMIT, WalkthroughSection } from './walkthrough-section';

function createMockStep(overrides?: Partial<WalkthroughStep>): WalkthroughStep {
    return {
        id: 'step-1',
        title: 'Test Step',
        description: 'A test step description',
        isComplete: false,
        ...overrides
    };
}

function createMockWalkthrough(overrides?: Partial<Walkthrough>): Walkthrough {
    return {
        id: 'test-walkthrough',
        title: 'Test Walkthrough',
        description: 'A test walkthrough description',
        steps: [
            createMockStep({ id: 'step-1', title: 'First Step' }),
            createMockStep({ id: 'step-2', title: 'Second Step' })
        ],
        pluginId: 'test.plugin',
        ...overrides
    };
}

interface MockWalkthroughService extends Pick<WalkthroughService,
    'getWalkthroughs' | 'getWalkthrough' | 'onDidChangeWalkthroughs' | 'onDidChangeSelection' |
    'selectedWalkthrough' | 'selectedStep' | 'selectWalkthrough' | 'selectStep' | 'clearSelection' |
    'markStepComplete' | 'markStepIncomplete' | 'markAllStepsComplete' | 'resetProgress' | 'getStepProgress' | 'handleLinkClick'
> {
    changeEmitter: Emitter<void>;
    selectionEmitter: Emitter<void>;
}

/**
 * Mirrors the selection handling of the real service: the selection is owned by the service, not by the component.
 */
function createMockWalkthroughService(walkthroughs: Walkthrough[] = []): MockWalkthroughService {
    const changeEmitter = new Emitter<void>();
    const selectionEmitter = new Emitter<void>();
    let selectedWalkthroughId: string | undefined;
    let selectedStepId: string | undefined;
    return {
        changeEmitter,
        selectionEmitter,
        getWalkthroughs: () => [...walkthroughs],
        getWalkthrough: (id: string) => walkthroughs.find(w => w.id === id),
        onDidChangeWalkthroughs: changeEmitter.event,
        onDidChangeSelection: selectionEmitter.event,
        get selectedWalkthrough(): Walkthrough | undefined {
            return walkthroughs.find(w => w.id === selectedWalkthroughId);
        },
        get selectedStep(): WalkthroughStep | undefined {
            return this.selectedWalkthrough?.steps.find(s => s.id === selectedStepId);
        },
        selectWalkthrough: (id: string) => {
            const walkthrough = walkthroughs.find(w => w.id === id);
            if (walkthrough) {
                selectedWalkthroughId = id;
                selectedStepId = (walkthrough.steps.find(s => !s.isComplete) ?? walkthrough.steps[0])?.id;
                selectionEmitter.fire();
            }
        },
        selectStep: (stepId: string) => {
            selectedStepId = stepId;
            selectionEmitter.fire();
        },
        clearSelection: () => {
            selectedWalkthroughId = undefined;
            selectedStepId = undefined;
            selectionEmitter.fire();
        },
        markStepComplete: () => Promise.resolve(),
        markStepIncomplete: () => Promise.resolve(),
        markAllStepsComplete: () => Promise.resolve(),
        resetProgress: () => Promise.resolve(),
        getStepProgress: () => ({ completed: 0, total: 0 }),
        handleLinkClick: () => Promise.resolve()
    };
}

function createMockMarkdownRenderer(): MarkdownRenderer {
    return {
        render: () => {
            const div = document.createElement('div');
            div.textContent = 'rendered markdown';
            return { element: div, dispose: () => { } };
        }
    };
}

function createMockThemeService(themeType: ThemeType = 'dark'): ThemeService {
    return {
        getCurrentTheme: () => ({ id: 'test', label: 'Test', type: themeType }),
        onDidColorThemeChange: () => Disposable.NULL
    } as unknown as ThemeService;
}

function createMockLogger(): ILogger {
    return { warn: () => { }, error: () => { }, info: () => { }, debug: () => { } } as unknown as ILogger;
}

describe('WalkthroughSection', () => {
    let container: HTMLElement;
    let root: Root;
    let mockRenderer: MarkdownRenderer;

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        mockRenderer = createMockMarkdownRenderer();
    });

    afterEach(() => {
        root.unmount();
        document.body.removeChild(container);
    });

    it('should render nothing when getWalkthroughs returns empty array', done => {
        const mockService = createMockWalkthroughService([]);

        root.render(
            <WalkthroughSection
                walkthroughService={mockService as unknown as WalkthroughService}
                markdownRenderer={mockRenderer}
                themeService={createMockThemeService()}
                logger={createMockLogger()}
            />
        );

        setTimeout(() => {
            const cards = container.querySelectorAll('.gs-walkthrough-card');
            assert.strictEqual(cards.length, 0, 'Should have no walkthrough cards');

            const section = container.querySelector('.gs-section');
            // eslint-disable-next-line no-null/no-null
            assert.strictEqual(section, null, 'Should not render the section');
            done();
        }, 50);
    });

    it('should render walkthrough cards when walkthroughs exist', done => {
        const walkthroughs = [
            createMockWalkthrough({ id: 'wt1', title: 'Walkthrough One' }),
            createMockWalkthrough({ id: 'wt2', title: 'Walkthrough Two' })
        ];
        const mockService = createMockWalkthroughService(walkthroughs);

        root.render(
            <WalkthroughSection
                walkthroughService={mockService as unknown as WalkthroughService}
                markdownRenderer={mockRenderer}
                themeService={createMockThemeService()}
                logger={createMockLogger()}
            />
        );

        setTimeout(() => {
            const cards = container.querySelectorAll('.gs-walkthrough-card');
            assert.strictEqual(cards.length, 2, 'Should render 2 walkthrough cards');

            const titles = container.querySelectorAll('.gs-walkthrough-card-title');
            assert.ok(titles[0]?.textContent?.includes('Walkthrough One'), 'First card should show correct title');
            assert.ok(titles[1]?.textContent?.includes('Walkthrough Two'), 'Second card should show correct title');
            done();
        }, 50);
    });

    it('should transition from card list to detail view when a card is clicked', done => {
        const walkthroughs = [
            createMockWalkthrough({ id: 'wt1', title: 'Click Me' })
        ];
        const mockService = createMockWalkthroughService(walkthroughs);

        root.render(
            <WalkthroughSection
                walkthroughService={mockService as unknown as WalkthroughService}
                markdownRenderer={mockRenderer}
                themeService={createMockThemeService()}
                logger={createMockLogger()}
            />
        );

        setTimeout(() => {
            const card = container.querySelector('.gs-walkthrough-card') as HTMLElement;
            assert.ok(card, 'Card should exist');
            card.click();

            setTimeout(() => {
                const detailView = container.querySelector('.gs-walkthrough-detail');
                assert.ok(detailView, 'Detail view should be visible after clicking card');

                const detailTitle = container.querySelector('.gs-walkthrough-detail-title');
                assert.ok(detailTitle?.textContent?.includes('Click Me'), 'Detail view should show walkthrough title');

                const cardList = container.querySelector('.gs-walkthrough-cards');
                // eslint-disable-next-line no-null/no-null
                assert.strictEqual(cardList, null, 'Card list should not be visible in detail view');
                done();
            }, 50);
        }, 50);
    });

    it('should return to card list when back button is clicked in detail view', done => {
        const walkthroughs = [
            createMockWalkthrough({ id: 'wt1', title: 'Test WT' })
        ];
        const mockService = createMockWalkthroughService(walkthroughs);

        root.render(
            <WalkthroughSection
                walkthroughService={mockService as unknown as WalkthroughService}
                markdownRenderer={mockRenderer}
                themeService={createMockThemeService()}
                logger={createMockLogger()}
            />
        );

        setTimeout(() => {
            // Click on card to enter detail view
            const card = container.querySelector('.gs-walkthrough-card') as HTMLElement;
            card.click();

            setTimeout(() => {
                assert.ok(container.querySelector('.gs-walkthrough-detail'), 'Should be in detail view');

                // Click back
                const backLink = container.querySelector('.gs-walkthrough-back-link') as HTMLElement;
                assert.ok(backLink, 'Back link should exist');
                backLink.click();

                setTimeout(() => {
                    const cards = container.querySelectorAll('.gs-walkthrough-card');
                    assert.strictEqual(cards.length, 1, 'Card list should be visible again');

                    const detail = container.querySelector('.gs-walkthrough-detail');
                    // eslint-disable-next-line no-null/no-null
                    assert.strictEqual(detail, null, 'Detail view should not be visible');
                    done();
                }, 50);
            }, 50);
        }, 50);
    });

    it('should re-render when onDidChangeWalkthroughs fires', done => {
        const walkthroughs = [
            createMockWalkthrough({ id: 'wt1', title: 'Original' })
        ];
        const mockService = createMockWalkthroughService(walkthroughs);

        root.render(
            <WalkthroughSection
                walkthroughService={mockService as unknown as WalkthroughService}
                markdownRenderer={mockRenderer}
                themeService={createMockThemeService()}
                logger={createMockLogger()}
            />
        );

        setTimeout(() => {
            let cards = container.querySelectorAll('.gs-walkthrough-card');
            assert.strictEqual(cards.length, 1, 'Should have 1 card initially');

            // Add a second walkthrough and fire change event
            walkthroughs.push(createMockWalkthrough({ id: 'wt2', title: 'New One' }));
            mockService.changeEmitter.fire();

            setTimeout(() => {
                cards = container.querySelectorAll('.gs-walkthrough-card');
                assert.strictEqual(cards.length, 2, 'Should have 2 cards after change event');
                done();
            }, 50);
        }, 50);
    });

    it('should show the detail view when the service selects a valid walkthrough id', done => {
        const walkthroughs = [
            createMockWalkthrough({ id: 'wt1', title: 'First' }),
            createMockWalkthrough({ id: 'wt2', title: 'Second' })
        ];
        const mockService = createMockWalkthroughService(walkthroughs);

        root.render(
            <WalkthroughSection
                walkthroughService={mockService as unknown as WalkthroughService}
                markdownRenderer={mockRenderer}
                themeService={createMockThemeService()}
                logger={createMockLogger()}
            />
        );

        setTimeout(() => {
            // Select the second walkthrough through the service, as `walkthrough.open` does
            mockService.selectWalkthrough('wt2');

            setTimeout(() => {
                const detailView = container.querySelector('.gs-walkthrough-detail');
                assert.ok(detailView, 'Detail view should be visible');

                const detailTitle = container.querySelector('.gs-walkthrough-detail-title');
                assert.ok(detailTitle?.textContent?.includes('Second'), 'Should show the selected walkthrough');
                done();
            }, 50);
        }, 50);
    });

    it('should not navigate to detail view when an unknown walkthrough id is selected', done => {
        const walkthroughs = [
            createMockWalkthrough({ id: 'wt1', title: 'Only One' })
        ];
        const mockService = createMockWalkthroughService(walkthroughs);

        root.render(
            <WalkthroughSection
                walkthroughService={mockService as unknown as WalkthroughService}
                markdownRenderer={mockRenderer}
                themeService={createMockThemeService()}
                logger={createMockLogger()}
            />
        );

        setTimeout(() => {
            mockService.selectWalkthrough('nonexistent');

            setTimeout(() => {
                const detailView = container.querySelector('.gs-walkthrough-detail');
                // eslint-disable-next-line no-null/no-null
                assert.strictEqual(detailView, null, 'Should not show detail view for invalid ID');

                const cards = container.querySelectorAll('.gs-walkthrough-card');
                assert.strictEqual(cards.length, 1, 'Should still show cards');
                done();
            }, 50);
        }, 50);
    });

    it('should properly clean up event subscriptions on unmount', done => {
        const walkthroughs = [
            createMockWalkthrough({ id: 'wt1' })
        ];
        const mockService = createMockWalkthroughService(walkthroughs);

        root.render(
            <WalkthroughSection
                walkthroughService={mockService as unknown as WalkthroughService}
                markdownRenderer={mockRenderer}
                themeService={createMockThemeService()}
                logger={createMockLogger()}
            />
        );

        setTimeout(() => {
            // Unmount the component
            root.unmount();

            // Verify emitters can still fire without error (listeners were cleaned up)
            assert.doesNotThrow(() => {
                mockService.changeEmitter.fire();
                mockService.selectionEmitter.fire();
            }, 'Should not throw after unmount');

            // Re-create root for afterEach cleanup
            root = createRoot(container);
            done();
        }, 50);
    });
    it('should list at most WALKTHROUGH_LIST_LIMIT walkthroughs and delegate More... to the picker', done => {
        const walkthroughs = [1, 2, 3, 4, 5].map(i => createMockWalkthrough({ id: `wt${i}`, title: `WT ${i}` }));
        const mockService = createMockWalkthroughService(walkthroughs);
        let showAllCalled = false;

        root.render(
            <WalkthroughSection
                walkthroughService={mockService as unknown as WalkthroughService}
                markdownRenderer={mockRenderer}
                themeService={createMockThemeService()}
                logger={createMockLogger()}
                onShowAll={() => { showAllCalled = true; }}
            />
        );

        setTimeout(() => {
            assert.strictEqual(container.querySelectorAll('.gs-walkthrough-card').length, WALKTHROUGH_LIST_LIMIT, 'Should list only the first few cards');

            const more = container.querySelector('.gs-walkthrough-more') as HTMLElement;
            assert.ok(more, 'More link should exist');
            more.click();

            setTimeout(() => {
                assert.strictEqual(showAllCalled, true, 'More... should offer all walkthroughs for selection');
                assert.strictEqual(container.querySelectorAll('.gs-walkthrough-card').length, WALKTHROUGH_LIST_LIMIT, 'The list itself should not expand');
                done();
            }, 50);
        }, 50);
    });

    it('should not list a walkthrough whose steps are all complete', done => {
        const walkthroughs = [
            createMockWalkthrough({ id: 'pending', title: 'Pending' }),
            createMockWalkthrough({
                id: 'done',
                title: 'Done',
                steps: [createMockStep({ id: 's1', isComplete: true })]
            })
        ];
        const mockService = createMockWalkthroughService(walkthroughs);

        root.render(
            <WalkthroughSection
                walkthroughService={mockService as unknown as WalkthroughService}
                markdownRenderer={mockRenderer}
                themeService={createMockThemeService()}
                logger={createMockLogger()}
                onShowAll={() => { }}
            />
        );

        setTimeout(() => {
            const titles = Array.from(container.querySelectorAll('.gs-walkthrough-card-title')).map(e => e.textContent);
            assert.deepStrictEqual(titles, ['Pending'], 'Only the unfinished walkthrough should be listed');
            // The completed one is still reachable, so the link has to stay.
            assert.ok(container.querySelector('.gs-walkthrough-more'), 'More link should be offered');
            done();
        }, 50);
    });

    it('should not offer More... when every walkthrough is listed', done => {
        const walkthroughs = [1, 2].map(i => createMockWalkthrough({ id: `wt${i}`, title: `WT ${i}` }));
        const mockService = createMockWalkthroughService(walkthroughs);

        root.render(
            <WalkthroughSection
                walkthroughService={mockService as unknown as WalkthroughService}
                markdownRenderer={mockRenderer}
                themeService={createMockThemeService()}
                logger={createMockLogger()}
                onShowAll={() => { }}
            />
        );

        setTimeout(() => {
            assert.strictEqual(container.querySelectorAll('.gs-walkthrough-card').length, 2, 'Should list both cards');
            // eslint-disable-next-line no-null/no-null
            assert.strictEqual(container.querySelector('.gs-walkthrough-more'), null, 'More link should not exist');
            done();
        }, 50);
    });
});
