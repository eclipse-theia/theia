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
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { ThemeType } from '@theia/core/lib/common/theme';
import * as sinon from 'sinon';
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
    return new MockLogger();
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
        sinon.restore();
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
                onToggleStepDone={() => undefined}
                onMarkAllStepsDone={() => undefined}
                markdownRenderer={mockRenderer}
            />
        );

        setTimeout(() => {
            const title = container.querySelector('.gs-walkthrough-detail-title');
            assert.ok(title, 'Title element should exist');
            assert.ok(title?.textContent?.includes('Detail Walkthrough'), 'Should contain walkthrough title');

            const backLink = container.querySelector('.gs-walkthrough-back-link');
            assert.ok(backLink, 'Back link should exist');
            assert.ok(backLink?.textContent?.includes('Back'), 'Back link should have a label');
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
                onToggleStepDone={() => undefined}
                onMarkAllStepsDone={() => undefined}
                markdownRenderer={mockRenderer}
            />
        );

        setTimeout(() => {
            const stepItems = container.querySelectorAll('.gs-walkthrough-step');
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
                onToggleStepDone={() => undefined}
                onMarkAllStepsDone={() => undefined}
                selectedStep={selectedStep}
                markdownRenderer={mockRenderer}
            />
        );

        setTimeout(() => {
            const stepItems = container.querySelectorAll('.gs-walkthrough-step');
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
                onToggleStepDone={() => undefined}
                onMarkAllStepsDone={() => undefined}
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
                onToggleStepDone={() => undefined}
                onMarkAllStepsDone={() => undefined}
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
                onToggleStepDone={() => undefined}
                onMarkAllStepsDone={() => undefined}
                selectedStep={selectedStep}
                markdownRenderer={mockRenderer}
            />
        );

        setTimeout(() => {
            const stepContent = container.querySelector('.gs-walkthrough-step-content');
            assert.ok(stepContent, 'Step content section should exist');

            const stepTitle = stepContent?.parentElement?.querySelector('.gs-walkthrough-step-title');
            assert.ok(stepTitle, 'Step title should exist');
            assert.ok(stepTitle?.textContent?.includes('Content Step'), 'Should show step title');

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
                onToggleStepDone={() => undefined}
                onMarkAllStepsDone={() => undefined}
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
                onToggleStepDone={() => undefined}
                onMarkAllStepsDone={() => undefined}
                markdownRenderer={mockRenderer}
            />
        );

        setTimeout(() => {
            const stepItems = container.querySelectorAll('.gs-walkthrough-step');
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
                onToggleStepDone={() => undefined}
                onMarkAllStepsDone={() => undefined}
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
        sinon.stub(globalThis, 'fetch').resolves({ ok: true, text: async () => '<svg />' } as Response);
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
                onToggleStepDone={() => undefined}
                onMarkAllStepsDone={() => undefined}
                selectedStep={selectedStep}
                markdownRenderer={mockRenderer}
            />
        );

        setTimeout(() => {
            const iframe = container.querySelector('.gs-walkthrough-media-svg') as HTMLIFrameElement;
            assert.ok(iframe, 'SVG iframe should exist');
            assert.ok(iframe.srcdoc.includes('<svg />'), 'SVG source should be embedded in the iframe document');
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
                onMarkAllStepsDone={() => undefined}
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
                onMarkAllStepsDone={() => undefined}
            />
        );

        setTimeout(() => {
            const icon = container.querySelector('.gs-walkthrough-step-icon') as HTMLElement;
            assert.ok(icon.classList.contains('codicon-pass-filled'), 'A completed step should have the completed icon');
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
                onToggleStepDone={() => undefined}
                onMarkAllStepsDone={() => { markedAll = true; }}
            />
        );

        setTimeout(() => {
            const button = container.querySelector('.gs-walkthrough-mark-done') as HTMLElement;
            assert.ok(button, 'Mark Done action should exist');
            assert.ok(button.closest('.gs-walkthrough-steps'), 'It should sit with the step list');
            button.click();

            setTimeout(() => {
                assert.strictEqual(markedAll, true, 'onMarkAllStepsDone should have been called');
                done();
            }, 50);
        }, 50);
    });

    it('should keep Mark Done available once every step is complete', done => {
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
                onToggleStepDone={() => undefined}
                onMarkAllStepsDone={() => undefined}
            />
        );

        setTimeout(() => {
            const button = container.querySelector('.gs-walkthrough-mark-done');
            assert.ok(button, 'Mark Done action should exist');
            done();
        }, 50);
    });

    it('should render a one-link `command:` description as an action button', done => {
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
                onToggleStepDone={() => undefined}
                onMarkAllStepsDone={() => undefined}
                selectedStep={selectedStep}
                markdownRenderer={linkRenderer}
            />
        );

        setTimeout(() => {
            const button = container.querySelector('.gs-walkthrough-step-description .gs-walkthrough-command-button') as HTMLElement;
            assert.ok(button, 'The command link should be rendered as an action button');
            assert.ok(button.classList.contains('theia-button'), 'A one-link description should use Theia button styling');
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
                onToggleStepDone={() => undefined}
                onMarkAllStepsDone={() => undefined}
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
                onToggleStepDone={() => undefined}
                onMarkAllStepsDone={() => undefined}
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
        sinon.stub(globalThis, 'fetch').resolves({ ok: true, text: async () => '[Run](command:my.command)' } as Response);

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
                onToggleStepDone={() => undefined}
                onMarkAllStepsDone={() => undefined}
                onLinkClick={() => { }}
            />
        );

        setTimeout(() => {
            const media = captured.find(entry => entry.value.includes('command:my.command'));
            assert.ok(media, 'The media content should have been rendered');
            assert.strictEqual(media?.isTrusted, true, 'Media has to be trusted, otherwise command links are stripped');
            assert.ok(media?.options?.actionHandler, 'Media needs an action handler, otherwise its links are inert');
            done();
        }, 50);
    });
});
