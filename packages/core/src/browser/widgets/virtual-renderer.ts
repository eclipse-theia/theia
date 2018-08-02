/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { h, VirtualNode, VirtualText, VirtualDOM } from '@phosphor/virtualdom';

// Phosphor elements can be null, so we need to disable our no-null rule
// tslint:disable:no-null-keyword

/*
 * @deprecated use ReactRenderer instead. VirtualRenderer will be removed with the next major release.
 */
export class VirtualRenderer {
    readonly host: HTMLElement;
    constructor(
        host?: HTMLElement
    ) {
        this.host = host || document.createElement('div');
    }

    render(): void {
        VirtualRenderer.render(this.doRender(), this.host);
    }

    protected doRender(): h.Child {
        return null;
    }
}

export namespace VirtualRenderer {
    /*
     * @deprecated use ReactDOM.render instead. VirtualRenderer will be removed with the next major release.
     */
    export function render(child: h.Child, host: HTMLElement) {
        const content = toContent(child);
        VirtualDOM.render(content, host);
    }
    export function flatten(children: h.Child[]): h.Child {
        return children.reduce((prev, current) => merge(prev, current), null);
    }

    export function merge(left: h.Child | undefined, right: h.Child | undefined): h.Child {
        if (!right) {
            return left || null;
        }
        if (!left) {
            return right;
        }
        const result = left instanceof Array ? left : [left];
        if (right instanceof Array) {
            result.push(...right);
        } else {
            result.push(right);
        }
        return result;
    }

    export function toContent(children: h.Child): VirtualNode | VirtualNode[] | null {
        if (!children) {
            return null;
        }
        if (typeof children === 'string') {
            return new VirtualText(children);
        }
        if (children instanceof Array) {
            const nodes: VirtualNode[] = [];
            for (const child of children) {
                if (child) {
                    const node = typeof child === 'string' ? new VirtualText(child) : child;
                    nodes.push(node);
                }
            }
            return nodes;
        }
        return children;
    }
}
