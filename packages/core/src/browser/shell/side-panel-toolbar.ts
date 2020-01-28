/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { Widget, Title } from '@phosphor/widgets';
import { TabBarToolbar, TabBarToolbarRegistry, TabBarToolbarFactory } from './tab-bar-toolbar';
import { Message } from '@phosphor/messaging';
import { BaseWidget } from '../widgets';
import { Emitter } from '../../common/event';

export class SidePanelToolbar extends BaseWidget {

    protected titleContainer: HTMLElement | undefined;
    private _toolbarTitle: Title<Widget> | undefined;
    protected toolbar: TabBarToolbar | undefined;

    protected readonly onContextMenuEmitter = new Emitter<MouseEvent>();
    readonly onContextMenu = this.onContextMenuEmitter.event;

    constructor(
        protected readonly tabBarToolbarRegistry: TabBarToolbarRegistry,
        protected readonly tabBarToolbarFactory: TabBarToolbarFactory,
        protected readonly side: 'left' | 'right') {
        super();
        this.toDispose.push(this.onContextMenuEmitter);
        this.init();
        this.tabBarToolbarRegistry.onDidChange(() => this.update());
    }

    protected onBeforeAttach(msg: Message): void {
        super.onBeforeAttach(msg);
        if (this.titleContainer) {
            this.addEventListener(this.titleContainer, 'contextmenu', e => this.onContextMenuEmitter.fire(e));
        }
    }

    protected onAfterAttach(msg: Message): void {
        if (this.toolbar) {
            if (this.toolbar.isAttached) {
                Widget.detach(this.toolbar);
            }
            Widget.attach(this.toolbar, this.node);
        }
        super.onAfterAttach(msg);
    }

    protected onBeforeDetach(msg: Message): void {
        if (this.titleContainer) {
            this.node.removeChild(this.titleContainer);
        }
        if (this.toolbar && this.toolbar.isAttached) {
            Widget.detach(this.toolbar);
        }
        super.onBeforeDetach(msg);
    }

    protected onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        this.updateToolbar();
    }

    protected updateToolbar(): void {
        if (!this.toolbar) {
            return;
        }
        const current = this._toolbarTitle;
        const widget = current && current.owner || undefined;
        const items = widget ? this.tabBarToolbarRegistry.visibleItems(widget) : [];
        this.toolbar.updateItems(items, widget);
    }

    protected init(): void {
        this.titleContainer = document.createElement('div');
        this.titleContainer.classList.add('theia-sidepanel-title');
        this.titleContainer.classList.add('noWrapInfo');
        this.titleContainer.classList.add('noselect');
        this.node.appendChild(this.titleContainer);
        this.node.classList.add('theia-sidepanel-toolbar');
        this.node.classList.add(`theia-${this.side}-side-panel`);
        this.toolbar = this.tabBarToolbarFactory();
        this.update();
    }

    set toolbarTitle(title: Title<Widget> | undefined) {
        if (this.titleContainer && title) {
            this._toolbarTitle = title;
            this.titleContainer.innerText = this._toolbarTitle.label;
            this.titleContainer.title = this._toolbarTitle.caption || this._toolbarTitle.label;
            this.update();
        }
    }
}
