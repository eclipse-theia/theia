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
import { Disposable, DisposableCollection, disposableTimeout, isOSX } from '../common';
import { MarkdownString } from '../common/markdown-rendering/markdown-string';
import { animationFrame } from './browser';
import { MarkdownRenderer, MarkdownRendererFactory } from './markdown-rendering/markdown-renderer';
import { PreferenceService } from './preferences';

import '../../src/browser/style/hover-service.css';

export type HoverPosition = 'left' | 'right' | 'top' | 'bottom';

export namespace HoverPosition {
    export function invertIfNecessary(position: HoverPosition, target: DOMRect, host: DOMRect, totalWidth: number, totalHeight: number): HoverPosition {
        if (position === 'left') {
            if (target.left - host.width - 5 < 0) {
                return 'right';
            }
        } else if (position === 'right') {
            if (target.right + host.width + 5 > totalWidth) {
                return 'left';
            }
        } else if (position === 'top') {
            if (target.top - host.height - 5 < 0) {
                return 'bottom';
            }
        } else if (position === 'bottom') {
            if (target.bottom + host.height + 5 > totalHeight) {
                return 'top';
            }
        }
        return position;
    }
}

export interface HoverRequest {
    content: string | MarkdownString | HTMLElement
    target: HTMLElement
    /**
     * The position where the hover should appear.
     * Note that the hover service will try to invert the position (i.e. right -> left)
     * if the specified content does not fit in the window next to the target element
     */
    position: HoverPosition
    /**
     * Additional css classes that should be added to the hover box.
     * Used to style certain boxes different e.g. for the extended tab preview.
     */
    cssClasses?: string []
}

@injectable()
export class HoverService {
    protected static hostClassName = 'theia-hover';
    protected static styleSheetId = 'theia-hover-style';
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
            this._hoverHost.classList.add(HoverService.hostClassName);
            this._hoverHost.style.position = 'absolute';
        }
        return this._hoverHost;
    }
    protected pendingTimeout: Disposable | undefined;
    protected hoverTarget: HTMLElement | undefined;
    protected lastHidHover = Date.now();
    protected readonly disposeOnHide = new DisposableCollection();

    requestHover(request: HoverRequest): void {
        if (request.target !== this.hoverTarget) {
            this.cancelHover();
            this.pendingTimeout = disposableTimeout(() => this.renderHover(request), this.getHoverDelay());
        }
    }

    protected getHoverDelay(): number {
        return Date.now() - this.lastHidHover < 200
            ? 0
            : this.preferences.get('workbench.hover.delay', isOSX ? 1500 : 500);
    }

    protected async renderHover(request: HoverRequest): Promise<void> {
        const host = this.hoverHost;
        const { target, content, position, cssClasses } = request;
        if (cssClasses) {
            host.classList.add(...cssClasses);
        }
        this.hoverTarget = target;
        if (content instanceof HTMLElement) {
            host.appendChild(content);
        } else if (typeof content === 'string') {
            host.textContent = content;
        } else {
            const renderedContent = this.markdownRenderer.render(content);
            this.disposeOnHide.push(renderedContent);
            host.appendChild(renderedContent.element);
        }
        // browsers might insert linebreaks when the hover appears at the edge of the window
        // resetting the position prevents that
        host.style.left = '0px';
        host.style.top = '0px';
        document.body.append(host);
        await animationFrame(); // Allow the browser to size the host
        const updatedPosition = this.setHostPosition(target, host, position);

        this.disposeOnHide.push({
            dispose: () => {
                this.lastHidHover = Date.now();
                host.classList.remove(updatedPosition);
                if (cssClasses) {
                    host.classList.remove(...cssClasses);
                }
            }
        });

        this.listenForMouseOut();
    }

    protected setHostPosition(target: HTMLElement, host: HTMLElement, position: HoverPosition): HoverPosition {
        const targetDimensions = target.getBoundingClientRect();
        const hostDimensions = host.getBoundingClientRect();
        const documentWidth = document.body.getBoundingClientRect().width;
        // document.body.getBoundingClientRect().height doesn't work as expected
        // scrollHeight will always be accurate here: https://stackoverflow.com/a/44077777
        const documentHeight = document.documentElement.scrollHeight;
        position = HoverPosition.invertIfNecessary(position, targetDimensions, hostDimensions, documentWidth, documentHeight);
        if (position === 'top' || position === 'bottom') {
            const targetMiddleWidth = targetDimensions.left + (targetDimensions.width / 2);
            const middleAlignment = targetMiddleWidth - (hostDimensions.width / 2);
            const furthestRight = Math.min(documentWidth - hostDimensions.width, middleAlignment);
            const left = Math.max(0, furthestRight);
            const top = position === 'top'
                ? targetDimensions.top - hostDimensions.height - 5
                : targetDimensions.bottom + 5;
            host.style.setProperty('--theia-hover-before-position', `${targetMiddleWidth - left - 5}px`);
            host.style.top = `${top}px`;
            host.style.left = `${left}px`;
        } else {
            const targetMiddleHeight = targetDimensions.top + (targetDimensions.height / 2);
            const middleAlignment = targetMiddleHeight - (hostDimensions.height / 2);
            const furthestTop = Math.min(documentHeight - hostDimensions.height, middleAlignment);
            const top = Math.max(0, furthestTop);
            const left = position === 'left'
                ? targetDimensions.left - hostDimensions.width - 5
                : targetDimensions.right + 5;
            host.style.setProperty('--theia-hover-before-position', `${targetMiddleHeight - top - 5}px`);
            host.style.left = `${left}px`;
            host.style.top = `${top}px`;
        }
        host.classList.add(position);
        return position;
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
