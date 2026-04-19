// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { Disposable, DisposableCollection } from '@theia/core';
import { nls } from '@theia/core/lib/common/nls';
import { IMarker, Terminal } from 'xterm';
import { TerminalBlock, TerminalBlockBoundary } from './base/terminal-widget';
import { inject } from '@theia/core/shared/inversify';

export const TerminalBlockHoverOverlayOptions = Symbol('TerminalBlockHoverOverlayOptions');
export interface TerminalBlockHoverOverlayOptions {
    readonly term: Terminal;
    readonly renderBlockMenu: (event: MouseEvent, block: TerminalBlock) => void;
}

export interface TerminalBlockHoverOverlay {
    element: HTMLElement;
    startMarker: IMarker;
    endMarker: IMarker;
}

export const TerminalBlockHoverOverlayControllerFactory = Symbol('TerminalBlockHoverOverlayControllerFactory');
export type TerminalBlockHoverOverlayControllerFactory =
    (options: TerminalBlockHoverOverlayOptions) => TerminalBlockHoverOverlayController;

/**
 * Owns the terminal block hover overlay DOM, marker tracking, and refresh lifecycle.
 */
export class TerminalBlockHoverOverlayController implements Disposable {
    protected readonly term: Terminal;
    protected readonly renderBlockMenu: (event: MouseEvent, block: TerminalBlock) => void;

    protected container: HTMLElement | undefined;
    protected readonly blockOverlays: TerminalBlockHoverOverlay[] = [];
    protected readonly markerMap = new WeakMap<TerminalBlock, Record<TerminalBlockBoundary, IMarker | undefined>>();
    protected readonly toDispose = new DisposableCollection();
    protected pendingOverlayUpdate = false;
    protected disposed = false;

    constructor(
        @inject(TerminalBlockHoverOverlayOptions) protected readonly options: TerminalBlockHoverOverlayOptions
    ) {
        this.term = options.term;
        this.renderBlockMenu = options.renderBlockMenu;
    }

    /**
     * Attaches the overlay container and subscribes to terminal and viewport refresh events.
     */
    initialize(): void {
        if (this.disposed || this.container || !this.term.element) {
            return;
        }
        const container = document.createElement('div');
        container.className = 'terminal-block-overlay';
        this.term.element.appendChild(container);
        this.container = container;

        this.toDispose.push(this.term.onResize(() => this.update()));

        const viewport = this.term.element.querySelector('.xterm-viewport');
        if (viewport) {
            const scrollHandler = () => this.update();
            viewport.addEventListener('scroll', scrollHandler);
            this.toDispose.push(Disposable.create(() => viewport.removeEventListener('scroll', scrollHandler)));
        }
    }

    /**
     * Registers a completed terminal block so its hover affordance can be rendered and tracked.
     */
    addBlock(block: TerminalBlock, commandStartMarker: IMarker | undefined, endMarker: IMarker | undefined): void {
        if (this.disposed) {
            return;
        }
        this.initialize();
        if (!commandStartMarker || commandStartMarker.isDisposed || !endMarker || endMarker.isDisposed || !this.container) {
            return;
        }

        const currentAbsLine = this.term.buffer.active.baseY + this.term.buffer.active.cursorY;
        const trackStart = this.term.registerMarker(commandStartMarker.line - currentAbsLine);
        const trackEnd = this.term.registerMarker(endMarker.line - currentAbsLine);

        if (!trackStart || !trackEnd) {
            trackStart?.dispose();
            trackEnd?.dispose();
            return;
        }

        this.markerMap.set(block,
            {
                [TerminalBlockBoundary.Top]: trackStart,
                [TerminalBlockBoundary.Bottom]: trackEnd
            }
        );

        const hoverOverlay = document.createElement('div');
        hoverOverlay.classList.add('terminal-command-hover');
        hoverOverlay.style.display = 'none';
        hoverOverlay.appendChild(this.createButton(block, hoverOverlay));
        this.container.appendChild(hoverOverlay);

        this.blockOverlays.push({ element: hoverOverlay, startMarker: trackStart, endMarker: trackEnd });
        this.update();
    }

    protected createButton(block: TerminalBlock, hoverOverlay: HTMLElement): HTMLElement {
        const button = document.createElement('button');
        button.classList.add('terminal-block-actions-button', 'codicon', 'codicon-ellipsis');
        const blockActionsLabel = nls.localize('theia/terminal/blockActions', 'Terminal Block Actions');
        button.title = blockActionsLabel;
        button.setAttribute('aria-label', blockActionsLabel);
        button.addEventListener('mouseenter', () => hoverOverlay.classList.add('active'));
        button.addEventListener('mouseleave', () => hoverOverlay.classList.remove('active'));
        button.addEventListener('click', event => {
            event.stopPropagation();
            event.preventDefault();
            this.renderBlockMenu(event, block);
        });
        return button;
    }

    /**
     * Schedules an overlay reposition pass for the next animation frame.
     */
    update(): void {
        if (this.disposed || this.pendingOverlayUpdate) {
            return;
        }
        this.pendingOverlayUpdate = true;
        requestAnimationFrame(() => {
            if (this.disposed) {
                return;
            }
            this.pendingOverlayUpdate = false;
            this.doUpdate();
        });
    }

    /**
     * Scrolls the terminal viewport to the requested boundary of a previously registered block.
     */
    scrollToBoundary(block: TerminalBlock, boundary: TerminalBlockBoundary): void {
        const markers = this.markerMap.get(block);
        if (!markers) {
            return;
        }
        if (boundary === TerminalBlockBoundary.Top) {
            const marker = markers[TerminalBlockBoundary.Top];
            if (marker) {
                this.term.scrollToLine(marker.line);
            }
            return;
        }
        const startMarker = markers[TerminalBlockBoundary.Top];
        const endMarker = markers[TerminalBlockBoundary.Bottom];
        if (!startMarker || !endMarker) {
            return;
        }
        const lastBlockLine = Math.max(startMarker.line, endMarker.line - 1);
        const topLineForBottomAlignment = Math.max(0, lastBlockLine - (this.term.rows - 1));
        this.term.scrollToLine(topLineForBottomAlignment);
    }

    protected doUpdate(): void {
        if (this.disposed || !this.container || !this.term.element) {
            return;
        }
        const screen = this.term.element.querySelector('.xterm-screen') as HTMLElement | null;
        if (!screen || this.term.rows === 0) {
            return;
        }
        const rowHeight = screen.clientHeight / this.term.rows;
        if (rowHeight <= 0) {
            return;
        }
        const viewportY = this.term.buffer.active.viewportY;
        const termHeight = this.term.rows * rowHeight;
        for (let i = this.blockOverlays.length - 1; i >= 0; i--) {
            const { element, startMarker, endMarker } = this.blockOverlays[i];
            if (startMarker.isDisposed || endMarker.isDisposed) {
                element.remove();
                this.blockOverlays.splice(i, 1);
                continue;
            }
            const startPx = (startMarker.line - viewportY) * rowHeight;
            const endPx = (endMarker.line - viewportY) * rowHeight;
            const visibleTop = Math.max(0, startPx);
            const visibleBottom = Math.min(termHeight, endPx);
            if (visibleBottom <= visibleTop) {
                element.style.display = 'none';
            } else {
                element.style.display = 'flex';
                element.style.top = `${visibleTop}px`;
                element.style.height = `${visibleBottom - visibleTop}px`;
            }
        }
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        for (const { element, startMarker, endMarker } of this.blockOverlays) {
            element.remove();
            if (!startMarker.isDisposed) {
                startMarker.dispose();
            }
            if (!endMarker.isDisposed) {
                endMarker.dispose();
            }
        }
        this.blockOverlays.length = 0;
        this.container?.remove();
        this.container = undefined;
        this.toDispose.dispose();
    }
}
