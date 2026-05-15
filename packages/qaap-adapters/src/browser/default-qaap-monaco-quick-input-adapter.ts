// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { ApplicationShell } from '@theia/core/lib/browser/shell';
import { MOBILE_ONE_COLUMN_LAYOUT_CLASS, matchesMobileNarrowViewport } from '@theia/core/lib/browser/shell/mobile-layout-state';
import { QaapMonacoQuickInputAdapter } from './qaap-monaco-quick-input-adapter';

@injectable()
export class DefaultQaapMonacoQuickInputAdapter implements QaapMonacoQuickInputAdapter {

    synchronize(shell: ApplicationShell, container: HTMLElement, defaultSync: () => void): void {
        document.body.appendChild(container);
        const mobile = matchesMobileNarrowViewport()
            || shell.node.classList.contains(MOBILE_ONE_COLUMN_LAYOUT_CLASS);
        if (mobile) {
            this.clearMobileInlineStyles(container);
            queueMicrotask(() => {
                this.clearMobileInlineStyles(container);
                requestAnimationFrame(() => this.clearMobileInlineStyles(container));
            });
        } else {
            defaultSync();
        }
    }

    protected clearMobileInlineStyles(container: HTMLElement): void {
        container.style.removeProperty('top');
        const inner = container.querySelector<HTMLElement>('.quick-input-widget');
        if (inner) {
            inner.style.removeProperty('top');
            inner.style.removeProperty('left');
            inner.style.removeProperty('transform');
        }
    }
}
