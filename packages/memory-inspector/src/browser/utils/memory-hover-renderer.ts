/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
 ********************************************************************************/

import { Disposable } from '@theia/core';
import { Anchor } from '@theia/core/lib/browser';
import { injectable } from '@theia/core/shared/inversify';

export interface EasilyMappedObject {
    [key: string]: string | number;
}

@injectable()
export class MemoryHoverRendererService implements Disposable {
    protected readonly container: HTMLDivElement;
    protected isShown = false;
    protected currentRenderContainer: HTMLElement;

    constructor() {
        this.container = document.createElement('div');
        this.container.classList.add('t-mv-hover', 'hidden');
        document.body.appendChild(this.container);
    }

    render(container: HTMLElement, anchor: Anchor, properties?: EasilyMappedObject): void {
        this.clearAll();
        if (!this.isShown) {
            document.addEventListener('mousemove', this.closeIfHoverOff);
            this.currentRenderContainer = container;
        }

        if (properties) {
            for (const [key, value] of Object.entries(properties)) {
                const label = key.toLowerCase().replace(/[\W]/g, '-');
                const keySpan = document.createElement('span');
                keySpan.classList.add('t-mv-hover-key', label);
                keySpan.textContent = `${key}:`;
                const valueSpan = document.createElement('span');
                valueSpan.classList.add('t-mv-hover-value', label);
                // stringify as decimal number by default.
                valueSpan.textContent = value.toString(10);
                this.container.appendChild(keySpan);
                this.container.appendChild(valueSpan);
            }
        }

        if (this.container.children.length) {
            this.show(anchor);
            this.isShown = true;
        } else {
            this.hide();
        }
    }

    hide(): void {
        if (this.isShown) {
            document.removeEventListener('mousemove', this.closeIfHoverOff);
            this.container.classList.add('hidden');
            this.isShown = false;
        }
    }

    show({ x, y }: Anchor): void {
        this.container.classList.remove('hidden');
        this.container.style.top = `${y}px`;
        this.container.style.left = `${x}px`;
        setTimeout(() => this.checkNotOffScreen());
    }

    protected checkNotOffScreen(): void {
        const left = parseInt((this.container.style.left ?? '').replace('px', ''));
        const width = this.container.clientWidth;
        const overflow = left + width - document.body.clientWidth;
        if (overflow > 0) {
            const safeLeft = Math.round(left - overflow);
            this.container.style.left = `${safeLeft}px`;
        }
    }

    protected clearAll(): void {
        let toRemove = this.container.lastChild;
        while (toRemove) {
            this.container.removeChild(toRemove);
            toRemove = this.container.lastChild;
        }
    }

    protected closeIfHoverOff = (e: MouseEvent): void => {
        const { target } = e;
        if (!(target instanceof HTMLElement)) {
            return;
        }
        if (!this.currentRenderContainer.contains(target) && !this.container.contains(target)) {
            this.hide();
        }
    };

    dispose(): void {
        this.container.remove();
    }
}
