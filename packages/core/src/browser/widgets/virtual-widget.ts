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

import { injectable } from 'inversify';
import { h } from '@phosphor/virtualdom';
import { DisposableCollection } from '../../common';
import { BaseWidget, Message } from './widget';
import { VirtualRenderer } from './virtual-renderer';

/*
 * @deprecated use ReactWidget instead. VirtualWidget will be removed with the next major release.
 */
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
                this.childContainer = this.createChildContainer();
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

    protected createChildContainer(): HTMLElement {
        return document.createElement('div');
    }

}
