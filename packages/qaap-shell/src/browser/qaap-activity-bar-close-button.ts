// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { codicon } from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common';
import { Widget } from '@lumino/widgets';

/**
 * Collapse control for the side-panel activity row (icon only).
 */
export class QaapActivityBarCloseButton extends Widget {

    constructor(protected readonly onActivate: () => void) {
        const node = document.createElement('button');
        node.type = 'button';
        node.className = 'theia-activity-bar-close-btn';
        node.setAttribute('aria-label', nls.localize('theia/core/closeSidePanel', 'Close Side Panel'));
        const icon = document.createElement('span');
        icon.className = `theia-activity-bar-close-btn-icon ${codicon('close')}`;
        icon.setAttribute('aria-hidden', 'true');
        node.appendChild(icon);
        node.addEventListener('click', e => {
            e.stopPropagation();
            this.onActivate();
        });
        super({ node });
        this.addClass('theia-activity-bar-close');
    }
}
