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
import { Walkthrough, WalkthroughStep } from '../common/walkthrough-types';
import { WalkthroughCard } from './walkthrough-card';

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
            createMockStep({ id: 'step-2', title: 'Second Step' }),
            createMockStep({ id: 'step-3', title: 'Third Step' })
        ],
        pluginId: 'test.plugin',
        ...overrides
    };
}

describe('WalkthroughCard', () => {
    let container: HTMLElement;
    let root: Root;

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        root.unmount();
        document.body.removeChild(container);
    });

    it('should render walkthrough title and description', done => {
        const walkthrough = createMockWalkthrough({
            title: 'My Walkthrough',
            description: 'My description'
        });

        root.render(
            <WalkthroughCard walkthrough={walkthrough} onSelect={() => { }} />
        );

        setTimeout(() => {
            const title = container.querySelector('.gs-walkthrough-card-title');
            assert.ok(title, 'Title element should exist');
            assert.ok(title?.textContent?.includes('My Walkthrough'), 'Should contain the walkthrough title');

            const description = container.querySelector('.gs-walkthrough-card-description');
            assert.ok(description, 'Description element should exist');
            assert.ok(description?.textContent?.includes('My description'), 'Should contain the walkthrough description');
            done();
        }, 50);
    });

    it('should display progress bar with correct percentage', done => {
        const walkthrough = createMockWalkthrough({
            steps: [
                createMockStep({ id: 's1', isComplete: true }),
                createMockStep({ id: 's2', isComplete: false }),
                createMockStep({ id: 's3', isComplete: false })
            ]
        });

        root.render(
            <WalkthroughCard walkthrough={walkthrough} onSelect={() => { }} />
        );

        setTimeout(() => {
            const progressFill = container.querySelector('.gs-walkthrough-progress-fill') as HTMLElement;
            assert.ok(progressFill, 'Progress fill element should exist');
            const expectedWidth = `${(1 / 3) * 100}%`;
            assert.strictEqual(progressFill.style.width, expectedWidth, 'Progress fill should reflect 1 of 3 steps');

            const progressText = container.querySelector('.gs-walkthrough-progress-text');
            assert.ok(progressText, 'Progress text should exist');
            assert.ok(progressText?.textContent?.includes('1'), 'Should show completed count');
            assert.ok(progressText?.textContent?.includes('3'), 'Should show total count');
            done();
        }, 50);
    });

    it('should call onSelect when card is clicked', done => {
        const walkthrough = createMockWalkthrough();
        let selectedWalkthrough: Walkthrough | undefined;

        root.render(
            <WalkthroughCard walkthrough={walkthrough} onSelect={w => { selectedWalkthrough = w; }} />
        );

        setTimeout(() => {
            const card = container.querySelector('.gs-walkthrough-card') as HTMLElement;
            assert.ok(card, 'Card element should exist');
            card.click();

            setTimeout(() => {
                assert.ok(selectedWalkthrough, 'onSelect should have been called');
                assert.strictEqual(selectedWalkthrough?.id, walkthrough.id, 'Should pass the walkthrough to onSelect');
                done();
            }, 50);
        }, 50);
    });

    it('should render icon when walkthrough.icon is provided', done => {
        const walkthrough = createMockWalkthrough({ icon: 'play' });

        root.render(
            <WalkthroughCard walkthrough={walkthrough} onSelect={() => { }} />
        );

        setTimeout(() => {
            const icon = container.querySelector('.gs-walkthrough-icon');
            assert.ok(icon, 'Icon element should exist');
            assert.ok(icon?.classList.contains('codicon-play'), 'Should have the codicon-play class');
            done();
        }, 50);
    });

    it('should not render icon when walkthrough.icon is not provided', done => {
        const walkthrough = createMockWalkthrough({ icon: undefined });

        root.render(
            <WalkthroughCard walkthrough={walkthrough} onSelect={() => { }} />
        );

        setTimeout(() => {
            const icon = container.querySelector('.gs-walkthrough-icon');
            // eslint-disable-next-line no-null/no-null
            assert.strictEqual(icon, null, 'Icon element should not exist');
            done();
        }, 50);
    });

    it('should show 0% progress when no steps are complete', done => {
        const walkthrough = createMockWalkthrough();

        root.render(
            <WalkthroughCard walkthrough={walkthrough} onSelect={() => { }} />
        );

        setTimeout(() => {
            const progressFill = container.querySelector('.gs-walkthrough-progress-fill') as HTMLElement;
            assert.ok(progressFill, 'Progress fill element should exist');
            assert.strictEqual(progressFill.style.width, '0%', 'Progress should be 0%');
            done();
        }, 50);
    });

    it('should show 100% progress when all steps are complete', done => {
        const walkthrough = createMockWalkthrough({
            steps: [
                createMockStep({ id: 's1', isComplete: true }),
                createMockStep({ id: 's2', isComplete: true }),
            ]
        });

        root.render(
            <WalkthroughCard walkthrough={walkthrough} onSelect={() => { }} />
        );

        setTimeout(() => {
            const progressFill = container.querySelector('.gs-walkthrough-progress-fill') as HTMLElement;
            assert.ok(progressFill, 'Progress fill element should exist');
            assert.strictEqual(progressFill.style.width, '100%', 'Progress should be 100%');
            done();
        }, 50);
    });
    it('should fall back to the extension icon when the walkthrough contributes none', done => {
        const walkthrough = createMockWalkthrough({ icon: undefined, pluginIcon: 'http://localhost/icon.png' });

        root.render(
            <WalkthroughCard walkthrough={walkthrough} onSelect={() => { }} />
        );

        setTimeout(() => {
            const icon = container.querySelector('.gs-walkthrough-plugin-icon') as HTMLImageElement;
            assert.ok(icon, 'The extension icon should be rendered');
            assert.strictEqual(icon.getAttribute('src'), 'http://localhost/icon.png', 'It should use the resolved icon URL');
            done();
        }, 50);
    });

    it('should prefer a contributed codicon over the extension icon', done => {
        const walkthrough = createMockWalkthrough({ icon: 'play', pluginIcon: 'http://localhost/icon.png' });

        root.render(
            <WalkthroughCard walkthrough={walkthrough} onSelect={() => { }} />
        );

        setTimeout(() => {
            assert.ok(container.querySelector('.codicon-play'), 'The contributed codicon should win');
            // eslint-disable-next-line no-null/no-null
            assert.strictEqual(container.querySelector('.gs-walkthrough-plugin-icon'), null, 'The extension icon should be skipped');
            done();
        }, 50);
    });

    it('should render no icon when neither is available', done => {
        const walkthrough = createMockWalkthrough({ icon: undefined, pluginIcon: undefined });

        root.render(
            <WalkthroughCard walkthrough={walkthrough} onSelect={() => { }} />
        );

        setTimeout(() => {
            // eslint-disable-next-line no-null/no-null
            assert.strictEqual(container.querySelector('.gs-walkthrough-icon'), null, 'No icon element should exist');
            done();
        }, 50);
    });
});
