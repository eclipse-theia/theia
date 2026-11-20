// *****************************************************************************
// Copyright (C) 2026 Junaid Ahamed and others.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import * as React from '@theia/core/shared/react';
import { flushSync } from '@theia/core/shared/react-dom';
import { createRoot, Root } from '@theia/core/shared/react-dom/client';
import { ContextMenuRenderer } from '@theia/core/lib/browser/context-menu-renderer';
import { ScmInput } from '@theia/scm/lib/browser/scm-input';
import { AiAwareScmCommitWidget } from './ai-aware-scm-commit-widget.js';

disableJSDOM();

class TestCommitWidget extends AiAwareScmCommitWidget {
    renderForTest(input: ScmInput): React.ReactNode {
        return this.renderInput(input);
    }
}

describe('AiAwareScmCommitWidget', () => {
    let restoreJSDOM: () => void;
    let widget: TestCommitWidget;
    let input: ScmInput;
    let root: Root;
    let container: HTMLDivElement;
    let terminal: HTMLTextAreaElement;
    let staged: { id: string; resources: object[] };
    let activation: { isActive: boolean; canRun: boolean };

    beforeEach(() => {
        restoreJSDOM = enableJSDOM();
        input = new ScmInput();
        input.value = 'Commit message';
        staged = { id: 'index', resources: [] };
        activation = { isActive: true, canRun: false };
        widget = new TestCommitWidget({} as ContextMenuRenderer);
        const dependencies = widget as unknown as Record<string, unknown>;
        dependencies.scmService = {
            selectedRepository: { input, provider: { id: 'git', groups: [staged] } }
        };
        dependencies.keybindings = { acceleratorFor: () => [], getKeybindingsForCommand: () => [] };
        dependencies.aiActivationService = activation;
        dependencies.commitMessageRunner = { isRunning: () => false };
        dependencies.agentService = { isEnabled: () => false };
        container = document.createElement('div');
        terminal = document.createElement('textarea');
        document.body.append(container, terminal);
        root = createRoot(container);
        render();
    });

    afterEach(async () => {
        flushSync(() => root.unmount());
        widget.dispose();
        input.dispose();
        container.remove();
        terminal.remove();
        await new Promise<void>(resolve => setImmediate(resolve));
        restoreJSDOM();
    });

    function render(): void {
        flushSync(() => root.render(widget.renderForTest(input)));
    }

    function textarea(): HTMLTextAreaElement {
        return container.querySelector('textarea')!;
    }

    it('preserves external focus and the input when files are staged or unstaged', () => {
        const original = textarea();
        terminal.focus();
        for (const resources of [[{}], [{}, {}], []]) {
            staged.resources = resources;
            render();
            expect(textarea() === original, 'the commit textarea should not be replaced').to.equal(true);
            expect(document.activeElement === terminal, 'external focus should be preserved').to.equal(true);
        }
    });

    it('preserves the commit selection when the overlay appears and disappears', () => {
        const original = textarea();
        original.focus();
        original.setSelectionRange(2, 7);
        for (const resources of [[{}], []]) {
            staged.resources = resources;
            render();
            expect(textarea() === original, 'the commit textarea should not be replaced').to.equal(true);
            expect(document.activeElement === original, 'the commit textarea should have focus').to.equal(true);
            expect(original.selectionStart).to.equal(2);
            expect(original.selectionEnd).to.equal(7);
        }
    });

    it('only reserves overlay space while the button is rendered', () => {
        expect(!!container.querySelector('.theia-ai-commit-message-input-wrapper')).to.equal(false);
        staged.resources = [{}];
        render();
        expect(!!container.querySelector('.theia-ai-commit-message-input-wrapper')).to.equal(true);
        expect(!!container.querySelector('button')).to.equal(true);
        staged.resources = [];
        render();
        expect(!!container.querySelector('.theia-ai-commit-message-input-wrapper')).to.equal(false);
        expect(!!container.querySelector('button')).to.equal(false);
    });

    it('preserves external focus when AI is toggled and keeps explicit focus working', () => {
        staged.resources = [{}];
        render();
        const original = textarea();
        terminal.focus();
        for (const isActive of [false, true]) {
            activation.isActive = isActive;
            render();
            expect(textarea() === original, 'the commit textarea should not be replaced').to.equal(true);
            expect(document.activeElement === terminal, 'external focus should be preserved').to.equal(true);
            expect(!!container.querySelector('.theia-ai-commit-message-input-wrapper')).to.equal(isActive);
            expect(!!container.querySelector('button')).to.equal(isActive);
        }
        widget.focus();
        expect(document.activeElement === original, 'the commit textarea should have focus').to.equal(true);
    });
});
