// *****************************************************************************
// Copyright (C) 2026 theia-ide and others.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { ApplicationShell } from '@theia/core/lib/browser/shell';

/**
 * Keeps Monaco's `#quick-input-container` aligned with the workbench after show / layout.
 * Default matches upstream Theia (editor-aligned `top`). Product layers may `rebind` for mobile.
 */
export const MonacoQuickInputLayout = Symbol('MonacoQuickInputLayout');
export interface MonacoQuickInputLayout {
    synchronize(shell: ApplicationShell, container: HTMLElement): void;
}

@injectable()
export class DefaultMonacoQuickInputLayout implements MonacoQuickInputLayout {
    synchronize(shell: ApplicationShell, container: HTMLElement): void {
        container.style.top = `${shell.mainPanel.node.getBoundingClientRect().top}px`;
    }
}
