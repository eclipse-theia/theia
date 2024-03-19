// *****************************************************************************
// Copyright (C) 2024 TypeFox and others.
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

import { Disposable } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core/shared/vscode-languageserver-protocol';

/**
 * this service is for managing the viewport and scroll state of a notebook editor.
 * its used both for restoring scroll state after reopening an editor and for cell to check if they are in the viewport.
 */
@injectable()
export class NotebookViewportService implements Disposable {

    protected onDidChangeViewportEmitter = new Emitter<void>();
    readonly onDidChangeViewport = this.onDidChangeViewportEmitter.event;

    protected _viewportElement: HTMLDivElement | undefined;

    protected resizeObserver: ResizeObserver;

    set viewportElement(element: HTMLDivElement | undefined) {
        this._viewportElement = element;
        if (element) {
            this.onDidChangeViewportEmitter.fire();
            this.resizeObserver?.disconnect();
            this.resizeObserver = new ResizeObserver(() => this.onDidChangeViewportEmitter.fire());
            this.resizeObserver.observe(element);
        }
    }

    isElementInViewport(element: HTMLElement): boolean {
        if (this._viewportElement) {
            const rect = element.getBoundingClientRect();
            const viewRect = this._viewportElement.getBoundingClientRect();
            return rect.top < viewRect.top ? rect.bottom > viewRect.top : rect.top < viewRect.bottom;
        }
        return false;
    }

    onScroll(e: HTMLDivElement): void {
        this.onDidChangeViewportEmitter.fire();
    }

    dispose(): void {
        this.resizeObserver.disconnect();
    }
}
