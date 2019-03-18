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
import { TabBarToolbar, TabBarToolbarRegistry } from './tab-bar-toolbar';
import { Message } from '@phosphor/messaging';

export class SidePanelToolbar extends Widget {

    protected titleContainer: HTMLElement | undefined;
    private _toolbarTitle: Title<Widget> | undefined;
    protected toolbar: TabBarToolbar | undefined;

    constructor(
        protected readonly tabBarToolbarRegistry: TabBarToolbarRegistry,
        protected readonly tabBarToolbarFactory: () => TabBarToolbar,
        protected readonly side: 'left' | 'right') {
        super();
        this.init();
        this.tabBarToolbarRegistry.onDidChange(() => this.update());
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
        this.node.appendChild(this.titleContainer);
        this.node.classList.add('theia-sidepanel-toolbar');
        this.node.classList.add(`theia-${this.side}-side-panel`);
        this.toolbar = this.tabBarToolbarFactory();
        this.update();
    }

    set toolbarTitle(title: Title<Widget> | undefined) {
        if (this.titleContainer && title) {
            this._toolbarTitle = title;
            this.titleContainer.innerHTML = this._toolbarTitle.label;
            this.update();
        }
    }
}
