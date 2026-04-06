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
import { MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { Walkthrough, WalkthroughStep } from '../common/walkthrough-types';
import { WalkthroughCard, WalkthroughDetail } from './walkthrough-widget';

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
        extensionUri: '/test/path',
        ...overrides
    };
}

function createMockMarkdownRenderer(): MarkdownRenderer {
    return {
        render: (markdown: { value: string }) => {
            const div = document.createElement('div');
            div.textContent = markdown?.value ?? 'rendered markdown';
            return { element: div, dispose: () => { } };
        }
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
});

describe('WalkthroughDetail', () => {
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

    it('should render walkthrough title and back button', done => {
        const walkthrough = createMockWalkthrough({ title: 'Detail Walkthrough' });

        root.render(
            <WalkthroughDetail
                walkthrough={walkthrough}
                onStepSelect={() => { }}
                onBack={() => { }}
                markdownRenderer={mockRenderer}
            />
        );

        setTimeout(() => {
            const title = container.querySelector('.gs-walkthrough-detail-title');
            assert.ok(title, 'Title element should exist');
            assert.ok(title?.textContent?.includes('Detail Walkthrough'), 'Should contain walkthrough title');

            const backLink = container.querySelector('.gs-walkthrough-back-link');
            assert.ok(backLink, 'Back link should exist');
            done();
        }, 50);
    });

    it('should render all steps in the step list', done => {
        const walkthrough = createMockWalkthrough({
            steps: [
                createMockStep({ id: 's1', title: 'Step A' }),
                createMockStep({ id: 's2', title: 'Step B' }),
                createMockStep({ id: 's3', title: 'Step C' })
            ]
        });

        root.render(
            <WalkthroughDetail
                walkthrough={walkthrough}
                onStepSelect={() => { }}
                onBack={() => { }}
                markdownRenderer={mockRenderer}
            />
        );

        setTimeout(() => {
            const stepItems = container.querySelectorAll('.gs-walkthrough-step-item');
            assert.strictEqual(stepItems.length, 3, 'Should render 3 step items');

            const stepTitles = container.querySelectorAll('.gs-walkthrough-step-title');
            assert.ok(stepTitles[0]?.textContent?.includes('Step A'), 'First step should be Step A');
            assert.ok(stepTitles[1]?.textContent?.includes('Step B'), 'Second step should be Step B');
            assert.ok(stepTitles[2]?.textContent?.includes('Step C'), 'Third step should be Step C');
            done();
        }, 50);
    });

    it('should highlight the selected step', done => {
        const selectedStep = createMockStep({ id: 's2', title: 'Selected Step' });
        const walkthrough = createMockWalkthrough({
            steps: [
                createMockStep({ id: 's1', title: 'Step A' }),
                selectedStep,
                createMockStep({ id: 's3', title: 'Step C' })
            ]
        });

        root.render(
            <WalkthroughDetail
                walkthrough={walkthrough}
                onStepSelect={() => { }}
                onBack={() => { }}
                selectedStep={selectedStep}
                markdownRenderer={mockRenderer}
            />
        );

        setTimeout(() => {
            const stepItems = container.querySelectorAll('.gs-walkthrough-step-item');
            assert.ok(!stepItems[0].classList.contains('selected'), 'First step should not be selected');
            assert.ok(stepItems[1].classList.contains('selected'), 'Second step should be selected');
            assert.ok(!stepItems[2].classList.contains('selected'), 'Third step should not be selected');
            done();
        }, 50);
    });

    it('should call onBack when back button is clicked', done => {
        const walkthrough = createMockWalkthrough();
        let backCalled = false;

        root.render(
            <WalkthroughDetail
                walkthrough={walkthrough}
                onStepSelect={() => { }}
                onBack={() => { backCalled = true; }}
                markdownRenderer={mockRenderer}
            />
        );

        setTimeout(() => {
            const backLink = container.querySelector('.gs-walkthrough-back-link') as HTMLElement;
            assert.ok(backLink, 'Back link should exist');
            backLink.click();

            setTimeout(() => {
                assert.ok(backCalled, 'onBack should have been called');
                done();
            }, 50);
        }, 50);
    });

    it('should call onStepSelect when a step is clicked', done => {
        const steps = [
            createMockStep({ id: 's1', title: 'Step A' }),
            createMockStep({ id: 's2', title: 'Step B' })
        ];
        const walkthrough = createMockWalkthrough({ steps });
        let selectedStep: WalkthroughStep | undefined;

        root.render(
            <WalkthroughDetail
                walkthrough={walkthrough}
                onStepSelect={step => { selectedStep = step; }}
                onBack={() => { }}
                markdownRenderer={mockRenderer}
            />
        );

        setTimeout(() => {
            const stepItems = container.querySelectorAll('.gs-walkthrough-step-item');
            (stepItems[1] as HTMLElement).click();

            setTimeout(() => {
                assert.ok(selectedStep, 'onStepSelect should have been called');
                assert.strictEqual(selectedStep?.id, 's2', 'Should select the clicked step');
                done();
            }, 50);
        }, 50);
    });

    it('should render step content for the selected step', done => {
        const selectedStep = createMockStep({
            id: 's1',
            title: 'Content Step',
            description: 'Step with content'
        });
        const walkthrough = createMockWalkthrough({ steps: [selectedStep] });

        root.render(
            <WalkthroughDetail
                walkthrough={walkthrough}
                onStepSelect={() => { }}
                onBack={() => { }}
                selectedStep={selectedStep}
                markdownRenderer={mockRenderer}
            />
        );

        setTimeout(() => {
            const stepContent = container.querySelector('.gs-walkthrough-step-content');
            assert.ok(stepContent, 'Step content section should exist');

            const stepDetail = container.querySelector('.gs-walkthrough-step-detail');
            assert.ok(stepDetail, 'Step detail should exist');
            assert.ok(stepDetail?.textContent?.includes('Content Step'), 'Should show step title');

            const descriptionContainer = container.querySelector('.gs-walkthrough-step-description');
            assert.ok(descriptionContainer, 'Description container should exist');
            assert.ok(descriptionContainer?.textContent?.includes('Step with content'), 'Should show step description via markdown renderer');
            done();
        }, 50);
    });

    it('should not render step content when no step is selected', done => {
        const walkthrough = createMockWalkthrough();

        root.render(
            <WalkthroughDetail
                walkthrough={walkthrough}
                onStepSelect={() => { }}
                onBack={() => { }}
                markdownRenderer={mockRenderer}
            />
        );

        setTimeout(() => {
            const stepContent = container.querySelector('.gs-walkthrough-step-content');
            // eslint-disable-next-line no-null/no-null
            assert.strictEqual(stepContent, null, 'Step content should not be rendered');
            done();
        }, 50);
    });

    it('should show completion icon for completed steps', done => {
        const walkthrough = createMockWalkthrough({
            steps: [
                createMockStep({ id: 's1', isComplete: true }),
                createMockStep({ id: 's2', isComplete: false })
            ]
        });

        root.render(
            <WalkthroughDetail
                walkthrough={walkthrough}
                onStepSelect={() => { }}
                onBack={() => { }}
                markdownRenderer={mockRenderer}
            />
        );

        setTimeout(() => {
            const stepItems = container.querySelectorAll('.gs-walkthrough-step-item');
            assert.ok(stepItems[0].classList.contains('completed'), 'Completed step should have completed class');
            assert.ok(!stepItems[1].classList.contains('completed'), 'Incomplete step should not have completed class');

            const icons = container.querySelectorAll('.gs-walkthrough-step-icon');
            assert.ok(icons[0].classList.contains('codicon-pass-filled'), 'Completed step should have pass-filled icon');
            assert.ok(icons[1].classList.contains('codicon-circle-large-outline'), 'Incomplete step should have circle-outline icon');
            done();
        }, 50);
    });

    it('should render image media for selected step', done => {
        const selectedStep = createMockStep({
            id: 's1',
            media: { image: '/path/to/image.png', altText: 'test image' }
        });
        const walkthrough = createMockWalkthrough({ steps: [selectedStep] });

        root.render(
            <WalkthroughDetail
                walkthrough={walkthrough}
                onStepSelect={() => { }}
                onBack={() => { }}
                selectedStep={selectedStep}
                markdownRenderer={mockRenderer}
            />
        );

        setTimeout(() => {
            const img = container.querySelector('.gs-walkthrough-media-image') as HTMLImageElement;
            assert.ok(img, 'Image element should exist');
            assert.strictEqual(img.getAttribute('src'), '/path/to/image.png', 'Image src should be set');
            assert.strictEqual(img.getAttribute('alt'), 'test image', 'Image alt should be set');
            done();
        }, 50);
    });

    it('should render SVG media for selected step', done => {
        const selectedStep = createMockStep({
            id: 's1',
            media: { svg: '/path/to/graphic.svg' }
        });
        const walkthrough = createMockWalkthrough({ steps: [selectedStep] });

        root.render(
            <WalkthroughDetail
                walkthrough={walkthrough}
                onStepSelect={() => { }}
                onBack={() => { }}
                selectedStep={selectedStep}
                markdownRenderer={mockRenderer}
            />
        );

        setTimeout(() => {
            const img = container.querySelector('.gs-walkthrough-media-image') as HTMLImageElement;
            assert.ok(img, 'SVG image element should exist');
            assert.strictEqual(img.getAttribute('src'), '/path/to/graphic.svg', 'SVG src should be set');
            done();
        }, 50);
    });
});
