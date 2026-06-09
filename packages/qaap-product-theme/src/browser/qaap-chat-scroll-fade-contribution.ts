// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { FrontendApplication } from '@theia/core/lib/browser/frontend-application';
import {
    CHAT_SCROLL_FADE_SCROLLER_SELECTOR,
    installChatScrollFade,
} from './qaap-chat-scroll-fade';

/**
 * Toggles top/bottom scroll-fade overlays on AI chat and mobile transcript scroll hosts.
 */
@injectable()
export class QaapChatScrollFadeContribution implements FrontendApplicationContribution {

    protected readonly toDispose = new DisposableCollection();
    protected readonly patched = new WeakSet<HTMLElement>();
    protected fadePatches = new DisposableCollection();
    protected observer: MutationObserver | undefined;

    onStart(_app: FrontendApplication): void {
        if (typeof document === 'undefined') {
            return;
        }
        this.fadePatches = new DisposableCollection();
        this.patchExisting(document.body);
        this.observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node instanceof HTMLElement) {
                        this.patchExisting(node);
                    }
                }
            }
        });
        this.observer.observe(document.body, { childList: true, subtree: true });
        this.toDispose.push(Disposable.create(() => {
            this.observer?.disconnect();
            this.observer = undefined;
            this.fadePatches.dispose();
        }));
    }

    onStop(_app: FrontendApplication): void {
        this.toDispose.dispose();
    }

    protected patchExisting(root: ParentNode): void {
        if (root instanceof HTMLElement && root.matches(CHAT_SCROLL_FADE_SCROLLER_SELECTOR)) {
            this.patchElement(root);
        }
        root.querySelectorAll<HTMLElement>(CHAT_SCROLL_FADE_SCROLLER_SELECTOR).forEach(el => this.patchElement(el));
    }

    protected patchElement(element: HTMLElement): void {
        if (this.patched.has(element) || !element.isConnected) {
            return;
        }
        this.patched.add(element);
        this.fadePatches.push(installChatScrollFade(element));
    }
}
