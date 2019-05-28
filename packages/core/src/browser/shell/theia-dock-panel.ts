/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { find, toArray, ArrayExt } from '@phosphor/algorithm';
import { TabBar, Widget, DockPanel, Title, DockLayout } from '@phosphor/widgets';
import { Signal } from '@phosphor/signaling';
import { Disposable, DisposableCollection } from '../../common/disposable';

const MAXIMIZED_CLASS = 'theia-maximized';

export const MAIN_AREA_ID = 'theia-main-content-panel';
export const BOTTOM_AREA_ID = 'theia-bottom-content-panel';

/**
 * This specialization of DockPanel adds various events that are used for implementing the
 * side panels of the application shell.
 */
export class TheiaDockPanel extends DockPanel {

    /**
     * Emitted when a widget is added to the panel.
     */
    readonly widgetAdded = new Signal<this, Widget>(this);
    /**
     * Emitted when a widget is activated by calling `activateWidget`.
     */
    readonly widgetActivated = new Signal<this, Widget>(this);
    /**
     * Emitted when a widget is removed from the panel.
     */
    readonly widgetRemoved = new Signal<this, Widget>(this);

    constructor(options?: DockPanel.IOptions) {
        super(options);
        this['_onCurrentChanged'] = (sender: TabBar<Widget>, args: TabBar.ICurrentChangedArgs<Widget>) => {
            this.markAsCurrent(args.currentTitle || undefined);
            super['_onCurrentChanged'](sender, args);
        };
        this['_onTabActivateRequested'] = (sender: TabBar<Widget>, args: TabBar.ITabActivateRequestedArgs<Widget>) => {
            this.markAsCurrent(args.title);
            super['_onTabActivateRequested'](sender, args);
        };
    }

    protected _currentTitle: Title<Widget> | undefined;
    get currentTitle(): Title<Widget> | undefined {
        return this._currentTitle;
    }

    get currentTabBar(): TabBar<Widget> | undefined {
        return this._currentTitle && this.findTabBar(this._currentTitle);
    }

    findTabBar(title: Title<Widget>): TabBar<Widget> | undefined {
        return find(this.tabBars(), bar => ArrayExt.firstIndexOf(bar.titles, title) > -1);
    }

    protected readonly toDisposeOnMarkAsCurrent = new DisposableCollection();
    markAsCurrent(title: Title<Widget> | undefined): void {
        this.toDisposeOnMarkAsCurrent.dispose();
        this._currentTitle = title;
        if (title) {
            const resetCurrent = () => this.markAsCurrent(undefined);
            title.owner.disposed.connect(resetCurrent);
            this.toDisposeOnMarkAsCurrent.push(Disposable.create(() =>
                title.owner.disposed.disconnect(resetCurrent)
            ));
        }
    }

    addWidget(widget: Widget, options?: DockPanel.IAddOptions): void {
        if (this.mode === 'single-document' && widget.parent === this) {
            return;
        }
        super.addWidget(widget, options);
        this.widgetAdded.emit(widget);
    }

    activateWidget(widget: Widget): void {
        super.activateWidget(widget);
        this.widgetActivated.emit(widget);
    }

    protected onChildRemoved(msg: Widget.ChildMessage): void {
        super.onChildRemoved(msg);
        this.widgetRemoved.emit(msg.child);
    }

    nextTabBarWidget(widget: Widget): Widget | undefined {
        const current = this.findTabBar(widget.title);
        const next = current && this.nextTabBarInPanel(current);
        return next && next.currentTitle && next.currentTitle.owner || undefined;
    }

    nextTabBarInPanel(tabBar: TabBar<Widget>): TabBar<Widget> | undefined {
        const tabBars = toArray(this.tabBars());
        const index = tabBars.indexOf(tabBar);
        if (index !== -1) {
            return tabBars[index + 1];
        }
        return undefined;
    }

    previousTabBarWidget(widget: Widget): Widget | undefined {
        const current = this.findTabBar(widget.title);
        const previous = current && this.previousTabBarInPanel(current);
        return previous && previous.currentTitle && previous.currentTitle.owner || undefined;
    }

    previousTabBarInPanel(tabBar: TabBar<Widget>): TabBar<Widget> | undefined {
        const tabBars = toArray(this.tabBars());
        const index = tabBars.indexOf(tabBar);
        if (index !== -1) {
            return tabBars[index - 1];
        }
        return undefined;
    }

    protected readonly toDisposeOnToggleMaximized = new DisposableCollection();
    toggleMaximized(): void {
        const areaContainer = this.node.parentElement;
        if (!areaContainer) {
            return;
        }
        const maximizedElement = this.getMaximizedElement();
        if (areaContainer === maximizedElement) {
            this.toDisposeOnToggleMaximized.dispose();
            return;
        }
        maximizedElement.style.display = 'block';
        this.addClass(MAXIMIZED_CLASS);
        maximizedElement.appendChild(this.node);
        this.fit();
        this.toDisposeOnToggleMaximized.push(Disposable.create(() => {
            maximizedElement.style.display = 'none';
            this.removeClass(MAXIMIZED_CLASS);
            areaContainer.appendChild(this.node);
            this.fit();
        }));

        const layout = this.layout;
        if (layout instanceof DockLayout) {
            const onResize = layout['onResize'];
            layout['onResize'] = () => onResize.bind(layout)(Widget.ResizeMessage.UnknownSize);
            this.toDisposeOnToggleMaximized.push(Disposable.create(() => layout['onResize'] = onResize));
        }

        const removedListener = () => {
            if (!this.widgets().next()) {
                this.toDisposeOnToggleMaximized.dispose();
            }
        };
        this.widgetRemoved.connect(removedListener);
        this.toDisposeOnToggleMaximized.push(Disposable.create(() => this.widgetRemoved.disconnect(removedListener)));
    }

    protected maximizedElement: HTMLElement | undefined;
    protected getMaximizedElement(): HTMLElement {
        if (!this.maximizedElement) {
            this.maximizedElement = document.createElement('div');
            this.maximizedElement.style.display = 'none';
            document.body.appendChild(this.maximizedElement);
        }
        return this.maximizedElement;
    }

}
