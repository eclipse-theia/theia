/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { h, VirtualNode, VirtualText, VirtualDOM } from "@phosphor/virtualdom";

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
        if (typeof children === "string") {
            return new VirtualText(children);
        }
        if (children instanceof Array) {
            const nodes: VirtualNode[] = [];
            for (const child of children) {
                if (child) {
                    const node = typeof child === "string" ? new VirtualText(child) : child;
                    nodes.push(node);
                }
            }
            return nodes;
        }
        return children;
    }
}
