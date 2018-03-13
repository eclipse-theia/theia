/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { h } from "@phosphor/virtualdom";
import { DisposableCollection } from "../../common";
import { BaseWidget, Message } from "./widget";
import { VirtualRenderer } from "./virtual-renderer";

@injectable()
export class VirtualWidget extends BaseWidget {

    protected readonly onRender = new DisposableCollection();
    protected childContainer?: HTMLElement;
    protected scrollOptions = {
        suppressScrollX: true
    };

    protected onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        const child = this.render();
        if (!this.childContainer) {
            // if we are adding scrolling, we need to wrap the contents in its own div, to not conflict with the virtual dom algo.
            if (this.scrollOptions) {
                this.childContainer = document.createElement('div');
                this.node.appendChild(this.childContainer);
            } else {
                this.childContainer = this.node;
            }
        }
        VirtualRenderer.render(child, this.childContainer);
        this.onRender.dispose();
    }

    protected render(): h.Child {
        // tslint:disable-next-line:no-null-keyword
        return null;
    }

}
