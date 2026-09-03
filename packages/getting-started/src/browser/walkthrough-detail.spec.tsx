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
import { MarkdownRenderer, MarkdownRenderOptions } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { Disposable } from '@theia/core/lib/common/disposable';
import { ILogger } from '@theia/core/lib/common/logger';
import { ThemeType } from '@theia/core/lib/common/theme';
import { Walkthrough, WalkthroughStep } from '../common/walkthrough-types';
import { WalkthroughDetail } from './walkthrough-detail';

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

function createMockMarkdownRenderer(): MarkdownRenderer {
    return {
        render: (markdown: { value: string }) => {
            const div = document.createElement('div');
            div.textContent = markdown?.value ?? 'rendered markdown';
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
                logger={createMockLogger()}
                themeService={createMockThemeService()}
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
            // The label is a separate element so that it, and not the arrow icon, can carry the hover underline.
            assert.ok(backLink?.querySelector('.gs-walkthrough-back-label'), 'Back label should be its own element');
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
                logger={createMockLogger()}
                themeService={createMockThemeService()}
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
                logger={createMockLogger()}
                themeService={createMockThemeService()}
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
                logger={createMockLogger()}
                themeService={createMockThemeService()}
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
                logger={createMockLogger()}
                themeService={createMockThemeService()}
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
                logger={createMockLogger()}
                themeService={createMockThemeService()}
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
                logger={createMockLogger()}
                themeService={createMockThemeService()}
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
                logger={createMockLogger()}
                themeService={createMockThemeService()}
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
                logger={createMockLogger()}
                themeService={createMockThemeService()}
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

    it('should render SVG media inline for selected step', done => {
        const originalFetch = global.fetch;
        const svgContent = '<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="var(--vscode-foreground)" /></svg>';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (global as any).fetch = (url: string) => {
            assert.ok(url.includes('graphic.svg'));
            return Promise.resolve({ ok: true, text: () => Promise.resolve(svgContent) });
        };

        const selectedStep = createMockStep({
            id: 's1',
            media: { svg: '/path/to/graphic.svg', altText: 'SVG Graphic' }
        });
        const walkthrough = createMockWalkthrough({ steps: [selectedStep] });

        root.render(
            <WalkthroughDetail
                logger={createMockLogger()}
                themeService={createMockThemeService()}
                walkthrough={walkthrough}
                onStepSelect={() => { }}
                onBack={() => { }}
                selectedStep={selectedStep}
                markdownRenderer={mockRenderer}
            />
        );

        setTimeout(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (global as any).fetch = originalFetch;
            const svgContainer = container.querySelector('.gs-walkthrough-media-svg') as HTMLElement;
            assert.ok(svgContainer, 'SVG container element should exist');
            assert.strictEqual(svgContainer.getAttribute('role'), 'img', 'Role should be img');
            assert.strictEqual(svgContainer.getAttribute('aria-label'), 'SVG Graphic', 'aria-label should be set');
            const svgElement = svgContainer.querySelector('svg');
            assert.ok(svgElement, 'Inline SVG element should exist');
            assert.strictEqual(svgElement?.getAttribute('viewBox'), '0 0 100 100');
            const rectElement = svgContainer.querySelector('rect');
            assert.strictEqual(rectElement?.getAttribute('fill'), 'var(--vscode-foreground)');
            done();
        }, 50);
    });

    it('should handle command links clicked inside rendered SVG media', done => {
        const originalFetch = global.fetch;
        const svgContent = '<svg><a xlink:href="command:my.extension.command"><circle cx="50" cy="50" r="40" /></a></svg>';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (global as any).fetch = () => Promise.resolve({ ok: true, text: () => Promise.resolve(svgContent) });

        let clickedUrl = '';
        const selectedStep = createMockStep({
            id: 's1',
            media: { svg: 'sample.svg' }
        });
        const walkthrough = createMockWalkthrough({ steps: [selectedStep] });

        root.render(
            <WalkthroughDetail
                logger={createMockLogger()}
                themeService={createMockThemeService()}
                walkthrough={walkthrough}
                onStepSelect={() => { }}
                onBack={() => { }}
                selectedStep={selectedStep}
                markdownRenderer={mockRenderer}
                onLinkClick={url => { clickedUrl = url; }}
            />
        );

        setTimeout(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (global as any).fetch = originalFetch;
            const circle = container.querySelector('.gs-walkthrough-media-svg circle') as HTMLElement;
            assert.ok(circle, 'SVG circle should exist');
            circle.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

            setTimeout(() => {
                assert.strictEqual(clickedUrl, 'command:my.extension.command', 'Link click should route command URI');
                done();
            }, 50);
        }, 50);
    });

    it('should omit aria-label on SVG media when altText is not provided', done => {
        const originalFetch = global.fetch;
        const svgContent = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" /></svg>';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (global as any).fetch = () => Promise.resolve({ ok: true, text: () => Promise.resolve(svgContent) });

        const selectedStep = createMockStep({
            id: 's1',
            media: { svg: '/path/to/graphic.svg' }
        });
        const walkthrough = createMockWalkthrough({ steps: [selectedStep] });

        root.render(
            <WalkthroughDetail
                logger={createMockLogger()}
                themeService={createMockThemeService()}
                walkthrough={walkthrough}
                onStepSelect={() => { }}
                onBack={() => { }}
                selectedStep={selectedStep}
                markdownRenderer={mockRenderer}
            />
        );

        setTimeout(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (global as any).fetch = originalFetch;
            const svgContainer = container.querySelector('.gs-walkthrough-media-svg') as HTMLElement;
            assert.ok(svgContainer, 'SVG container element should exist');
            assert.strictEqual(svgContainer.getAttribute('role'), 'img');
            assert.strictEqual(svgContainer.hasAttribute('aria-label'), false, 'aria-label attribute should be omitted');
            done();
        }, 50);
    });

    it('should render nothing when SVG media fetch fails', done => {
        const originalFetch = global.fetch;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (global as any).fetch = () => Promise.resolve({ ok: false, text: () => Promise.resolve('') });

        const selectedStep = createMockStep({
            id: 's1',
            media: { svg: '/path/to/missing.svg' }
        });
        const walkthrough = createMockWalkthrough({ steps: [selectedStep] });

        root.render(
            <WalkthroughDetail
                logger={createMockLogger()}
                themeService={createMockThemeService()}
                walkthrough={walkthrough}
                onStepSelect={() => { }}
                onBack={() => { }}
                selectedStep={selectedStep}
                markdownRenderer={mockRenderer}
            />
        );

        setTimeout(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (global as any).fetch = originalFetch;
            const svgContainer = container.querySelector('.gs-walkthrough-media-svg');
            assert.ok(!svgContainer, 'No SVG container should be rendered on failure');
            const roleImg = container.querySelector('[role="img"]');
            assert.ok(!roleImg, 'No empty role=img should be left behind on failure');
            done();
        }, 50);
    });

    it('should clear previous SVG media when switching to another SVG step while loading', done => {
        const originalFetch = global.fetch;
        let resolveSecondFetch: (value: { ok: boolean; text: () => Promise<string> }) => void;
        const secondFetchPromise = new Promise<{ ok: boolean; text: () => Promise<string> }>(resolve => {
            resolveSecondFetch = resolve;
        });

        const firstSvg = '<svg id="first"><circle cx="10" cy="10" r="10" /></svg>';
        const secondSvg = '<svg id="second"><circle cx="20" cy="20" r="20" /></svg>';

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (global as any).fetch = (url: string) => {
            if (url.includes('first.svg')) {
                return Promise.resolve({ ok: true, text: () => Promise.resolve(firstSvg) });
            }
            return secondFetchPromise;
        };

        const step1 = createMockStep({ id: 's1', media: { svg: 'first.svg' } });
        const step2 = createMockStep({ id: 's2', media: { svg: 'second.svg' } });
        const walkthrough = createMockWalkthrough({ steps: [step1, step2] });

        root.render(
            <WalkthroughDetail
                logger={createMockLogger()}
                themeService={createMockThemeService()}
                walkthrough={walkthrough}
                onStepSelect={() => { }}
                onBack={() => { }}
                selectedStep={step1}
                markdownRenderer={mockRenderer}
            />
        );

        setTimeout(() => {
            assert.ok(container.querySelector('#first'), 'First SVG should be rendered');

            root.render(
                <WalkthroughDetail
                    logger={createMockLogger()}
                    themeService={createMockThemeService()}
                    walkthrough={walkthrough}
                    onStepSelect={() => { }}
                    onBack={() => { }}
                    selectedStep={step2}
                    markdownRenderer={mockRenderer}
                />
            );

            setTimeout(() => {
                assert.ok(!container.querySelector('#first'), 'First SVG should be cleared immediately upon step switch');
                assert.ok(!container.querySelector('.gs-walkthrough-media-svg'), 'No SVG container should be visible while loading');

                resolveSecondFetch({ ok: true, text: () => Promise.resolve(secondSvg) });

                setTimeout(() => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (global as any).fetch = originalFetch;
                    assert.ok(container.querySelector('#second'), 'Second SVG should be rendered after fetch resolves');
                    done();
                }, 50);
            }, 50);
        }, 50);
    });

    it('should turn single newlines in a description into Markdown hard breaks', done => {
        const renderedMarkdown: string[] = [];
        const recordingRenderer: MarkdownRenderer = {
            render: (markdown: { value: string }) => {
                renderedMarkdown.push(markdown.value);
                return { element: document.createElement('div'), dispose: () => { } };
            }
        };
        const selectedStep = createMockStep({
            id: 's1',
            description: 'First line\nSecond line\n\nNew paragraph'
        });
        const walkthrough = createMockWalkthrough({ steps: [selectedStep] });

        root.render(
            <WalkthroughDetail
                logger={createMockLogger()}
                themeService={createMockThemeService()}
                walkthrough={walkthrough}
                onStepSelect={() => { }}
                onBack={() => { }}
                selectedStep={selectedStep}
                markdownRenderer={recordingRenderer}
            />
        );

        setTimeout(() => {
            const description = renderedMarkdown.find(value => value.includes('First line'));
            assert.ok(description, 'The description should have been rendered');
            assert.ok(description?.includes('First line  \nSecond line'), 'A single newline should become a hard break');
            assert.ok(description?.includes('Second line\n\nNew paragraph'), 'A blank line should stay a paragraph break');
            done();
        }, 50);
    });
    it('should mark a step done when its step icon is clicked, without selecting the step', done => {
        const step = createMockStep({ id: 's1', isComplete: false });
        const walkthrough = createMockWalkthrough({ steps: [step] });
        let markedStep: WalkthroughStep | undefined;
        let selectedStep: WalkthroughStep | undefined;

        root.render(
            <WalkthroughDetail
                logger={createMockLogger()}
                themeService={createMockThemeService()}
                walkthrough={walkthrough}
                onStepSelect={s => { selectedStep = s; }}
                onBack={() => { }}
                markdownRenderer={mockRenderer}
                onToggleStepDone={s => { markedStep = s; }}
            />
        );

        setTimeout(() => {
            const icon = container.querySelector('.gs-walkthrough-step-icon') as HTMLElement;
            assert.ok(icon, 'Step icon should exist');
            icon.click();

            setTimeout(() => {
                assert.strictEqual(markedStep?.id, 's1', 'onToggleStepDone should receive the step');
                assert.strictEqual(selectedStep, undefined, 'Clicking the icon should not select the step');
                done();
            }, 50);
        }, 50);
    });

    it('should toggle a completed step back to pending when its step icon is clicked', done => {
        const step = createMockStep({ id: 's1', isComplete: true });
        const walkthrough = createMockWalkthrough({ steps: [step] });
        let toggledStep: WalkthroughStep | undefined;

        root.render(
            <WalkthroughDetail
                logger={createMockLogger()}
                themeService={createMockThemeService()}
                walkthrough={walkthrough}
                onStepSelect={() => { }}
                onBack={() => { }}
                markdownRenderer={mockRenderer}
                onToggleStepDone={s => { toggledStep = s; }}
            />
        );

        setTimeout(() => {
            const icon = container.querySelector('.gs-walkthrough-step-icon') as HTMLElement;
            assert.strictEqual(icon.getAttribute('aria-checked'), 'true', 'A completed step should read as checked');
            icon.click();

            setTimeout(() => {
                assert.strictEqual(toggledStep?.id, 's1', 'onToggleStepDone should receive the completed step');
                done();
            }, 50);
        }, 50);
    });

    it('should offer a Mark All Done action below the step list', done => {
        const walkthrough = createMockWalkthrough({
            steps: [createMockStep({ id: 's1' }), createMockStep({ id: 's2' })]
        });
        let markedAll = false;

        root.render(
            <WalkthroughDetail
                logger={createMockLogger()}
                themeService={createMockThemeService()}
                walkthrough={walkthrough}
                onStepSelect={() => { }}
                onBack={() => { }}
                markdownRenderer={mockRenderer}
                onMarkAllStepsDone={() => { markedAll = true; }}
            />
        );

        setTimeout(() => {
            const button = container.querySelector('.gs-walkthrough-mark-all-done') as HTMLButtonElement;
            assert.ok(button, 'Mark All Done button should exist');
            assert.ok(button.closest('.gs-walkthrough-steps'), 'It should sit with the step list');
            assert.ok(!button.disabled, 'It should be enabled while steps are pending');
            button.click();

            setTimeout(() => {
                assert.strictEqual(markedAll, true, 'onMarkAllStepsDone should have been called');
                done();
            }, 50);
        }, 50);
    });

    it('should disable Mark All Done once every step is complete', done => {
        const walkthrough = createMockWalkthrough({
            steps: [createMockStep({ id: 's1', isComplete: true }), createMockStep({ id: 's2', isComplete: true })]
        });

        root.render(
            <WalkthroughDetail
                logger={createMockLogger()}
                themeService={createMockThemeService()}
                walkthrough={walkthrough}
                onStepSelect={() => { }}
                onBack={() => { }}
                markdownRenderer={mockRenderer}
                onMarkAllStepsDone={() => { }}
            />
        );

        setTimeout(() => {
            const button = container.querySelector('.gs-walkthrough-mark-all-done') as HTMLButtonElement;
            assert.ok(button, 'Mark All Done button should exist');
            assert.ok(button.disabled, 'It should be disabled when nothing is left to complete');
            done();
        }, 50);
    });

    it('should keep `command:` links as plain inline links', done => {
        const selectedStep = createMockStep({ id: 's1', description: '[Do it](command:my.command)' });
        const walkthrough = createMockWalkthrough({ steps: [selectedStep] });
        const linkRenderer: MarkdownRenderer = {
            render: () => {
                const div = document.createElement('div');
                const anchor = document.createElement('a');
                anchor.setAttribute('data-href', 'command:my.command');
                anchor.textContent = 'Do it';
                div.appendChild(anchor);
                return { element: div, dispose: () => { } };
            }
        };

        root.render(
            <WalkthroughDetail
                logger={createMockLogger()}
                themeService={createMockThemeService()}
                walkthrough={walkthrough}
                onStepSelect={() => { }}
                onBack={() => { }}
                selectedStep={selectedStep}
                markdownRenderer={linkRenderer}
            />
        );

        setTimeout(() => {
            const anchor = container.querySelector('.gs-walkthrough-step-description a') as HTMLElement;
            assert.ok(anchor, 'The command link should be rendered');
            assert.ok(!anchor.classList.contains('theia-button'), 'A command link should not be styled as a button');
            done();
        }, 50);
    });

    it('should pick the image variant matching the current theme and resolve the plugin resource', done => {
        const selectedStep = createMockStep({
            id: 's1',
            media: {
                image: {
                    dark: 'hostedPlugin/pub_name/dark.png',
                    light: 'hostedPlugin/pub_name/light.png',
                    hc: 'hostedPlugin/pub_name/hc.png',
                    hcLight: 'hostedPlugin/pub_name/hc-light.png'
                },
                altText: 'themed'
            }
        });
        const walkthrough = createMockWalkthrough({ steps: [selectedStep] });

        root.render(
            <WalkthroughDetail
                logger={createMockLogger()}
                themeService={createMockThemeService('light')}
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
            const src = img.getAttribute('src')!;
            assert.ok(src.includes('light.png'), `Should use the light variant, was '${src}'`);
            assert.ok(!src.startsWith('hostedPlugin/'), `Should resolve against the backend endpoint, was '${src}'`);
            done();
        }, 50);
    });
    it('should not render completion actions inside the step content', done => {
        const selectedStep = createMockStep({ id: 's1', isComplete: false });
        const walkthrough = createMockWalkthrough({ steps: [selectedStep] });

        root.render(
            <WalkthroughDetail
                logger={createMockLogger()}
                themeService={createMockThemeService()}
                walkthrough={walkthrough}
                onStepSelect={() => { }}
                onBack={() => { }}
                selectedStep={selectedStep}
                markdownRenderer={mockRenderer}
                onToggleStepDone={() => { }}
                onMarkAllStepsDone={() => { }}
            />
        );

        setTimeout(() => {
            const content = container.querySelector('.gs-walkthrough-step-content')!;
            // eslint-disable-next-line no-null/no-null
            assert.strictEqual(content.querySelector('button'), null, 'The step content should carry no buttons');
            // eslint-disable-next-line no-null/no-null
            assert.strictEqual(content.querySelector('.gs-walkthrough-step-done'), null, 'The step content should carry no done indicator');
            done();
        }, 50);
    });
    it('should render markdown media as trusted and with an action handler, so that its links work', done => {
        const originalFetch = global.fetch;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (global as any).fetch = () => Promise.resolve({ ok: true, text: () => Promise.resolve('[Run](command:my.command)') });

        const captured: { value: string, isTrusted?: boolean, options?: MarkdownRenderOptions }[] = [];
        const recordingRenderer: MarkdownRenderer = {
            render: (markdown: { value: string, isTrusted?: boolean }, options?: MarkdownRenderOptions) => {
                captured.push({ ...markdown, options });
                return { element: document.createElement('div'), dispose: () => { } };
            }
        };
        const selectedStep = createMockStep({ id: 's1', media: { markdown: 'content.md' } });
        const walkthrough = createMockWalkthrough({ steps: [selectedStep] });

        root.render(
            <WalkthroughDetail
                logger={createMockLogger()}
                themeService={createMockThemeService()}
                walkthrough={walkthrough}
                onStepSelect={() => { }}
                onBack={() => { }}
                selectedStep={selectedStep}
                markdownRenderer={recordingRenderer}
                onLinkClick={() => { }}
            />
        );

        setTimeout(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (global as any).fetch = originalFetch;
            const media = captured.find(entry => entry.value.includes('command:my.command'));
            assert.ok(media, 'The media content should have been rendered');
            assert.strictEqual(media?.isTrusted, true, 'Media has to be trusted, otherwise command links are stripped');
            assert.ok(media?.options?.actionHandler, 'Media needs an action handler, otherwise its links are inert');
            done();
        }, 50);
    });
});
