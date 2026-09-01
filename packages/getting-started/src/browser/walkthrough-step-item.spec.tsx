// *****************************************************************************
// Copyright (C) 2026 Renesas Electronics Corporation and others.
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
import { MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { enableJSDOM, enableReactActEnvironment } from '@theia/core/lib/browser/test/jsdom';
import * as React from '@theia/core/shared/react';
import { createRoot, Root } from 'react-dom/client';
import * as sinon from 'sinon';
import { WalkthroughStep } from '../common/walkthrough-types';
import { WalkthroughStepItem } from './walkthrough-step-item';

let disableJSDOM: () => void;
let disableReactActEnvironment: () => void;

describe('WalkthroughStepItem', () => {
    let container: HTMLElement;
    let root: Root;
    const step: WalkthroughStep = {
        id: 'step',
        title: 'Selected step',
        description: '',
        isComplete: false,
    };

    before(() => {
        disableJSDOM = enableJSDOM();
        disableReactActEnvironment = enableReactActEnvironment();
    });
    after(() => {
        disableReactActEnvironment();
        disableJSDOM();
    });
    beforeEach(() => {
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });
    afterEach(() => {
        React.act(() => root.unmount());
        container.remove();
        sinon.restore();
    });

    function render(isSelected: boolean, onSelect = sinon.spy()): sinon.SinonSpy {
        React.act(() => {
            root.render(
                <WalkthroughStepItem
                    step={step}
                    isSelected={isSelected}
                    onSelect={onSelect}
                    onCompletionToggle={() => undefined}
                    markdownRenderer={{ render: () => ({ element: document.createElement('div'), dispose: () => undefined }) } as MarkdownRenderer}
                />,
            );
        });
        return onSelect;
    }

    it('marks the selected step title for its highlighted styling', done => {
        render(true);
        setTimeout(() => {
            const title = container.querySelector('.gs-walkthrough-step-title');
            assert.strictEqual(title?.tagName, 'H3');
            assert.ok(title?.closest('.gs-walkthrough-step')?.classList.contains('selected'));
            done();
        }, 0);
    });

    it('prevents pointer focus on the selected step title button', done => {
        const onSelect = render(false);
        setTimeout(() => {
            const button = container.querySelector('.gs-walkthrough-step-select') as HTMLButtonElement;
            const mouseDown = new button.ownerDocument.defaultView!.MouseEvent('mousedown', { bubbles: true, cancelable: true });
            button.dispatchEvent(mouseDown);
            assert.ok(mouseDown.defaultPrevented);
            assert.strictEqual(button.tabIndex, 0);
            button.click();
            assert.strictEqual(onSelect.callCount, 1);
            done();
        }, 0);
    });

    it('keeps cursor styling in the shared step-row stylesheet', done => {
        render(false);
        setTimeout(() => {
            const marker = container.querySelector('.gs-walkthrough-step-icon') as HTMLButtonElement;
            const mouseDown = new marker.ownerDocument.defaultView!.MouseEvent('mousedown', { bubbles: true, cancelable: true });
            marker.dispatchEvent(mouseDown);
            assert.ok(mouseDown.defaultPrevented);
            assert.ok(marker.classList.contains('gs-walkthrough-step-icon'));
            assert.ok(!marker.hasAttribute('style'));
            done();
        }, 0);
    });

    it('does not override the title cursor inline', done => {
        render(true);
        setTimeout(() => {
            const title = container.querySelector('.gs-walkthrough-step-select') as HTMLButtonElement;
            assert.ok(!title.hasAttribute('style'));
            done();
        }, 0);
    });

    it('exposes the completion state as a checkbox and the selected step as current', done => {
        const completedStep = { ...step, isComplete: true };
        React.act(() => {
            root.render(
                <WalkthroughStepItem
                    step={completedStep}
                    isSelected={true}
                    onSelect={() => undefined}
                    onCompletionToggle={() => undefined}
                    markdownRenderer={{ render: () => ({ element: document.createElement('div'), dispose: () => undefined }) } as MarkdownRenderer}
                />,
            );
        });
        setTimeout(() => {
            const completion = container.querySelector('.gs-walkthrough-step-icon');
            const item = container.querySelector('.gs-walkthrough-step');
            assert.strictEqual(completion?.getAttribute('role'), 'checkbox');
            assert.strictEqual(completion?.getAttribute('aria-checked'), 'true');
            assert.strictEqual(item?.getAttribute('aria-current'), 'step');
            done();
        }, 0);
    });

    it('selects and toggles completion from the keyboard', done => {
        const onSelect = sinon.spy();
        const onCompletionToggle = sinon.spy();
        React.act(() => {
            root.render(
                <WalkthroughStepItem
                    step={step}
                    isSelected={false}
                    onSelect={onSelect}
                    onCompletionToggle={onCompletionToggle}
                    markdownRenderer={{ render: () => ({ element: document.createElement('div'), dispose: () => undefined }) } as MarkdownRenderer}
                />,
            );
        });
        setTimeout(() => {
            const view = container.ownerDocument.defaultView!;
            const select = container.querySelector('.gs-walkthrough-step-select') as HTMLButtonElement;
            const completion = container.querySelector('.gs-walkthrough-step-icon') as HTMLButtonElement;
            select.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
            completion.dispatchEvent(new view.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
            assert.strictEqual(onSelect.callCount, 1);
            assert.strictEqual(onCompletionToggle.callCount, 1);
            done();
        }, 0);
    });
});
