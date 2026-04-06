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
import * as React from 'react';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';

let disableJSDOM = enableJSDOM();

import { createRoot, Root } from 'react-dom/client';
import { Emitter } from '@theia/core/lib/common/event';
import { MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { Walkthrough, WalkthroughStep } from '../common/walkthrough-types';
import { WalkthroughService } from './walkthrough-service';
import { WalkthroughSection } from './walkthrough-section';

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
        extensionUri: '/test/path',
        ...overrides
    };
}

interface MockWalkthroughService extends Pick<WalkthroughService,
    'getWalkthroughs' | 'getWalkthrough' | 'onDidChangeWalkthroughs' | 'onDidSelectWalkthrough' |
    'markStepComplete' | 'resetProgress' | 'getStepProgress' | 'selectWalkthrough'
> {
    changeEmitter: Emitter<void>;
    selectEmitter: Emitter<string>;
}

function createMockWalkthroughService(walkthroughs: Walkthrough[] = []): MockWalkthroughService {
    const changeEmitter = new Emitter<void>();
    const selectEmitter = new Emitter<string>();
    return {
        changeEmitter,
        selectEmitter,
        getWalkthroughs: () => [...walkthroughs],
        getWalkthrough: (id: string) => walkthroughs.find(w => w.id === id),
        onDidChangeWalkthroughs: changeEmitter.event,
        onDidSelectWalkthrough: selectEmitter.event,
        markStepComplete: () => Promise.resolve(),
        resetProgress: () => Promise.resolve(),
        getStepProgress: () => ({ completed: 0, total: 0 }),
        selectWalkthrough: () => { }
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

    it('should select walkthrough when onDidSelectWalkthrough fires with a valid ID', done => {
        const walkthroughs = [
            createMockWalkthrough({ id: 'wt1', title: 'First' }),
            createMockWalkthrough({ id: 'wt2', title: 'Second' })
        ];
        const mockService = createMockWalkthroughService(walkthroughs);

        root.render(
            <WalkthroughSection
                walkthroughService={mockService as unknown as WalkthroughService}
                markdownRenderer={mockRenderer}
            />
        );

        setTimeout(() => {
            // Fire select event for the second walkthrough
            mockService.selectEmitter.fire('wt2');

            setTimeout(() => {
                const detailView = container.querySelector('.gs-walkthrough-detail');
                assert.ok(detailView, 'Detail view should be visible');

                const detailTitle = container.querySelector('.gs-walkthrough-detail-title');
                assert.ok(detailTitle?.textContent?.includes('Second'), 'Should show the selected walkthrough');
                done();
            }, 50);
        }, 50);
    });

    it('should not navigate to detail view when onDidSelectWalkthrough fires with invalid ID', done => {
        const walkthroughs = [
            createMockWalkthrough({ id: 'wt1', title: 'Only One' })
        ];
        const mockService = createMockWalkthroughService(walkthroughs);

        root.render(
            <WalkthroughSection
                walkthroughService={mockService as unknown as WalkthroughService}
                markdownRenderer={mockRenderer}
            />
        );

        setTimeout(() => {
            mockService.selectEmitter.fire('nonexistent');

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
            />
        );

        setTimeout(() => {
            // Unmount the component
            root.unmount();

            // Verify emitters can still fire without error (listeners were cleaned up)
            assert.doesNotThrow(() => {
                mockService.changeEmitter.fire();
                mockService.selectEmitter.fire('wt1');
            }, 'Should not throw after unmount');

            // Re-create root for afterEach cleanup
            root = createRoot(container);
            done();
        }, 50);
    });
});
