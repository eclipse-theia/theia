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

import { injectable } from 'inversify';
import { Disposable, DisposableCollection } from '../../common/disposable.js';
import { codicon } from '../../browser/widgets/widget.js';

@injectable()
export class ElectronWindowTitleBarService {

    createControlButton(doc: Document, id: string, handler: () => void): HTMLElement {
        const button = doc.createElement('div');
        button.id = `${id}-button`;
        button.className = `control-button ${codicon(`chrome-${id}`)}`;
        button.addEventListener('click', handler);
        return button;
    }

    createWindowControlsContainer(doc: Document, windowName?: string): HTMLElement {
        const controls = doc.createElement('div');
        controls.id = 'window-controls';
        controls.append(
            this.createControlButton(doc, 'minimize', () => window.electronTheiaCore.minimize(windowName)),
            this.createControlButton(doc, 'maximize', () => window.electronTheiaCore.maximize(windowName)),
            this.createControlButton(doc, 'restore', () => window.electronTheiaCore.unMaximize(windowName)),
            this.createControlButton(doc, 'close', () => window.electronTheiaCore.close(windowName))
        );
        return controls;
    }

    setupMaximizeRestoreToggle(targetBody: HTMLElement, windowName?: string): Disposable {
        toggleMaximizedClass();
        const toDispose = new DisposableCollection();

        if (windowName) {
            toDispose.push(window.electronTheiaCore.onSecondaryWindowEvent(windowName, 'maximize', toggleMaximizedClass));
            toDispose.push(window.electronTheiaCore.onSecondaryWindowEvent(windowName, 'unmaximize', toggleMaximizedClass));
        } else {
            toDispose.push(window.electronTheiaCore.onWindowEvent('maximize', toggleMaximizedClass));
            toDispose.push(window.electronTheiaCore.onWindowEvent('unmaximize', toggleMaximizedClass));
        }

        function toggleMaximizedClass(): void {
            if (window.electronTheiaCore.isMaximized(windowName)) {
                targetBody.classList.add('maximized');
            } else {
                targetBody.classList.remove('maximized');
            }
        }

        return toDispose;
    }

    createDragPanel(doc: Document): HTMLElement {
        const dragPanel = doc.createElement('div');
        dragPanel.id = 'theia-drag-panel';
        return dragPanel;
    }

    createTitleElement(doc: Document, initialTitle: string): HTMLElement {
        const titleDiv = doc.createElement('div');
        titleDiv.id = 'theia-custom-title';
        titleDiv.textContent = initialTitle;
        return titleDiv;
    }
}
