// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';

/**
 * Applies Codex-style layout polish to every {@link AIChatInputWidget} toolbar:
 * marks the editor shell, moves model selectors to the right cluster, and swaps attach/tools icons.
 */
@injectable()
export class QaapChatInputCodexLayoutContribution implements FrontendApplicationContribution {

    protected static readonly EDITOR_BOX_SELECTOR = '.theia-ChatInput-Editor-Box';
    protected static readonly OPTIONS_SELECTOR = '.theia-ChatInputOptions';
    protected static readonly SHELL_CLASS = 'qaap-codex-input-shell';

    protected readonly toDispose = new DisposableCollection();
    protected observer: MutationObserver | undefined;

    onStart(): void {
        if (typeof document === 'undefined') {
            return;
        }
        const sweep = (root: ParentNode): void => {
            root.querySelectorAll?.<HTMLElement>(QaapChatInputCodexLayoutContribution.EDITOR_BOX_SELECTOR)
                .forEach(shell => this.enhanceShell(shell));
        };
        sweep(document);

        this.observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                mutation.addedNodes.forEach(node => {
                    if (!(node instanceof HTMLElement)) {
                        return;
                    }
                    if (node.matches?.(QaapChatInputCodexLayoutContribution.EDITOR_BOX_SELECTOR)) {
                        this.enhanceShell(node);
                    }
                    sweep(node);
                });
            }
        });
        this.observer.observe(document.body, { childList: true, subtree: true });
        this.toDispose.push(Disposable.create(() => {
            this.observer?.disconnect();
            this.observer = undefined;
        }));
    }

    onStop(): void {
        this.toDispose.dispose();
    }

    protected enhanceShell(shell: HTMLElement): void {
        if (!shell.classList.contains(QaapChatInputCodexLayoutContribution.SHELL_CLASS)) {
            shell.classList.add(QaapChatInputCodexLayoutContribution.SHELL_CLASS);
        }
        const options = shell.querySelector<HTMLElement>(QaapChatInputCodexLayoutContribution.OPTIONS_SELECTOR);
        if (!options) {
            return;
        }
        this.reorderToolbar(options);
        this.applyCodexIcons(options);
    }

    protected reorderToolbar(options: HTMLElement): void {
        const left = options.querySelector<HTMLElement>('.theia-ChatInputOptions-left');
        const right = options.querySelector<HTMLElement>('.theia-ChatInputOptions-right');
        if (!left || !right) {
            return;
        }
        const selectors = [
            ...left.querySelectorAll<HTMLElement>('.theia-ChatInput-ModeSelector, .theia-ChatInput-ReasoningSelector'),
        ];
        const mic = right.querySelector<HTMLElement>('.qaap-chat-mic-btn');
        const insertBefore = mic ?? right.firstChild;
        for (const selector of selectors) {
            if (selector.parentElement === left) {
                right.insertBefore(selector, insertBefore);
            }
        }
    }

    protected applyCodexIcons(options: HTMLElement): void {
        options.querySelector('.codicon-attach')?.classList.replace('codicon-attach', 'codicon-add');
        const toolsIcon = options.querySelector('.theia-ChatInputOptions-left .option .codicon-tools')
            ?? options.querySelector('.theia-ChatInputOptions-left .option .codicon-shield');
        toolsIcon?.classList.replace('codicon-tools', 'codicon-shield');
    }
}
