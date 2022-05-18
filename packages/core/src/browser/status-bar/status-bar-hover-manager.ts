// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from 'inversify';
import { Disposable, DisposableCollection, disposableTimeout, isOSX } from '../../common';
import { MarkdownString } from '../../common/markdown-rendering/markdown-string';
import { MarkdownRenderer, MarkdownRendererFactory } from '../markdown-rendering/markdown-renderer';
import { PreferenceService } from '../preferences';

@injectable()
export class StatusBarHoverManager {
    protected static hostClassName = 'theia-status-bar-hover';
    protected static styleSheetId = 'theia-status-bar-hover-style';
    @inject(PreferenceService) protected readonly preferences: PreferenceService;
    @inject(MarkdownRendererFactory) protected readonly markdownRendererFactory: MarkdownRendererFactory;

    protected _markdownRenderer: MarkdownRenderer | undefined;
    protected get markdownRenderer(): MarkdownRenderer {
        this._markdownRenderer ||= this.markdownRendererFactory();
        return this._markdownRenderer;
    }

    protected _hoverHost: HTMLElement | undefined;
    protected get hoverHost(): HTMLElement {
        if (!this._hoverHost) {
            this._hoverHost = document.createElement('div');
            this._hoverHost.classList.add(StatusBarHoverManager.hostClassName);
            this._hoverHost.style.position = 'absolute';
        }
        return this._hoverHost;
    }
    protected pendingTimeout: Disposable | undefined;
    protected hoverTarget: HTMLElement | undefined;
    protected lastHidHover = Date.now();
    protected readonly disposeOnHide = new DisposableCollection();

    requestHover(hover: string | MarkdownString | HTMLElement, target: HTMLElement): void {
        if (target !== this.hoverTarget) {
            this.cancelHover();
            this.pendingTimeout = disposableTimeout(() => this.renderHover(hover, target), this.getHoverDelay());
        }
    }

    protected getHoverDelay(): number {
        return Date.now() - this.lastHidHover < 200
            ? 0
            : this.preferences.get('workbench.hover.delay', isOSX ? 1500 : 500);
    }

    protected async renderHover(hover: string | MarkdownString | HTMLElement, target: HTMLElement): Promise<void> {
        const host = this.hoverHost;
        this.hoverTarget = target;
        if (hover instanceof HTMLElement) {
            host.appendChild(hover);
        } else if (typeof hover === 'string') {
            host.textContent = hover;
        } else {
            const content = this.markdownRenderer.render(hover);
            this.disposeOnHide.push(content);
            host.appendChild(content.element);
        }
        this.disposeOnHide.push({ dispose: () => this.lastHidHover = Date.now() });
        document.body.append(host);
        await new Promise(resolve => requestAnimationFrame(resolve)); // Allow the browser to size the host
        const targetDimensions = target.getBoundingClientRect();
        const targetMiddle = targetDimensions.left + (targetDimensions.width / 2);
        const hostDimensions = host.getBoundingClientRect();
        const documentWidth = document.body.getBoundingClientRect().width;
        const middleAlignment = targetMiddle - (hostDimensions.width / 2);
        const furthestRight = Math.min(documentWidth - hostDimensions.width, middleAlignment);
        const left = Math.max(0, furthestRight);
        host.style.setProperty('--theia-status-bar-hover-before-left', `${targetMiddle - left - 5}px`); // Centered on the status bar element.
        host.style.bottom = `${targetDimensions.height + 5}px`;
        host.style.left = `${left}px`;

        this.listenForMouseOut();
    }

    protected listenForMouseOut(): void {
        const handleMouseMove = (e: MouseEvent) => {
            if (e.target instanceof Node && !this.hoverHost.contains(e.target) && !this.hoverTarget?.contains(e.target)) {
                this.cancelHover();
            }
        };
        document.addEventListener('mousemove', handleMouseMove);
        this.disposeOnHide.push({ dispose: () => document.removeEventListener('mousemove', handleMouseMove) });
    }

    cancelHover(): void {
        this.pendingTimeout?.dispose();
        this.unRenderHover();
        this.disposeOnHide.dispose();
        this.hoverTarget = undefined;
    }

    protected unRenderHover(): void {
        this.hoverHost.remove();
        this.hoverHost.replaceChildren();
    }
}
