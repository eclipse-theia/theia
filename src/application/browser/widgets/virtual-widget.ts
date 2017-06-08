/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { h, VirtualNode, VirtualText, VirtualDOM } from "@phosphor/virtualdom";
import { DisposableCollection } from "../../common";
import { BaseWidget, Message } from "./widget";

@injectable()
export class VirtualWidget extends BaseWidget {

    protected readonly onRender = new DisposableCollection();

    protected onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);

        const child = this.render();
        VirtualWidget.render(child, this.node, () =>
            this.onRender.dispose()
        );
    }

    protected render(): h.Child {
        return null;
    }

}

export namespace VirtualWidget {
    export function render(child: h.Child, host: HTMLElement, onRender?: () => void) {
        const content = toContent(child);
        VirtualDOM.render(content, host);
        if (onRender) {
            onRender();
        }
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
