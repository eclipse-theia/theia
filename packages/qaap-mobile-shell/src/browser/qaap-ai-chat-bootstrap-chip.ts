// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { formatQaapBootstrapChipLabel } from './qaap-bootstrap-display';
import type { QaapBootstrapStateChange } from './qaap-project-bootstrap-service';

export const QAAP_AI_CHAT_BOOTSTRAP_CHIP_CLASS = 'qaap-ai-chat-bootstrap-chip';

/**
 * Injects a clickable bootstrap status chip above the chat input (narrow mobile layout).
 */
export class QaapAiChatBootstrapChip {

    protected mountDisposables = new DisposableCollection();
    protected chip: HTMLButtonElement | undefined;
    protected onClick: (() => void) | undefined;

    mount(host: HTMLElement, onClick: () => void): void {
        this.unmount();
        this.onClick = onClick;
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = QAAP_AI_CHAT_BOOTSTRAP_CHIP_CLASS;
        chip.hidden = true;
        chip.addEventListener('click', this.handleClick);
        this.mountDisposables.push(Disposable.create(() => chip.removeEventListener('click', this.handleClick)));
        host.prepend(chip);
        this.chip = chip;
    }

    update(state: QaapBootstrapStateChange): void {
        if (!this.chip) {
            return;
        }
        const label = formatQaapBootstrapChipLabel(state);
        if (!label) {
            this.chip.hidden = true;
            return;
        }
        this.chip.hidden = false;
        this.chip.textContent = label;
        this.chip.title = state.previewUrl
            ? `Open preview · ${state.previewUrl}`
            : 'Open dev preview';
        const failed = state.phase === 'install-failed' || state.phase === 'run-failed';
        this.chip.classList.toggle(`${QAAP_AI_CHAT_BOOTSTRAP_CHIP_CLASS}--failed`, failed);
        this.chip.classList.toggle(`${QAAP_AI_CHAT_BOOTSTRAP_CHIP_CLASS}--running`, state.phase === 'running');
    }

    unmount(): void {
        if (this.chip?.parentElement) {
            this.chip.parentElement.removeChild(this.chip);
        }
        this.chip = undefined;
        this.onClick = undefined;
        this.mountDisposables.dispose();
        this.mountDisposables = new DisposableCollection();
    }

    protected handleClick = (): void => {
        this.onClick?.();
    };
}
