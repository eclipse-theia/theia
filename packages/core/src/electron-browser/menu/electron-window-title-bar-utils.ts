// *****************************************************************************
// Copyright (C) 2026 and others.
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

import { codicon } from '../../browser/widgets/widget';

export function createControlButton(doc: Document, id: string, handler: () => void): HTMLElement {
    const button = doc.createElement('div');
    button.id = `${id}-button`;
    button.className = `control-button ${codicon(`chrome-${id}`)}`;
    button.addEventListener('click', handler);
    return button;
}

export function createWindowControlsContainer(doc: Document, windowName?: string): HTMLElement {
    const controls = doc.createElement('div');
    controls.id = 'window-controls';
    controls.append(
        createControlButton(doc, 'minimize', () => window.electronTheiaCore.minimize(windowName)),
        createControlButton(doc, 'maximize', () => window.electronTheiaCore.maximize(windowName)),
        createControlButton(doc, 'restore', () => window.electronTheiaCore.unMaximize(windowName)),
        createControlButton(doc, 'close', () => window.electronTheiaCore.close(windowName))
    );
    return controls;
}

export function setupMaximizeRestoreToggle(targetBody: HTMLElement, windowName?: string): void {
    toggleMaximizedClass();

    if (windowName) {
        window.electronTheiaCore.onSecondaryWindowEvent(windowName, 'maximize', toggleMaximizedClass);
        window.electronTheiaCore.onSecondaryWindowEvent(windowName, 'unmaximize', toggleMaximizedClass);
    } else {
        window.electronTheiaCore.onWindowEvent('maximize', toggleMaximizedClass);
        window.electronTheiaCore.onWindowEvent('unmaximize', toggleMaximizedClass);
    }

    function toggleMaximizedClass(): void {
        if (window.electronTheiaCore.isMaximized(windowName)) {
            targetBody.classList.add('maximized');
        } else {
            targetBody.classList.remove('maximized');
        }
    }
}

export function createDragPanel(doc: Document): HTMLElement {
    const dragPanel = doc.createElement('div');
    dragPanel.id = 'theia-drag-panel';
    return dragPanel;
}

export function createTitleElement(doc: Document, initialTitle: string): HTMLElement {
    const titleDiv = doc.createElement('div');
    titleDiv.id = 'theia-custom-title';
    titleDiv.textContent = initialTitle;
    return titleDiv;
}
