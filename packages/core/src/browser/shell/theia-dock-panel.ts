// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { find, toArray } from '@lumino/algorithm';
import { TabBar, Widget, DockPanel, Title } from '@lumino/widgets';
import { Signal } from '@lumino/signaling';
import { Drag } from '@lumino/dragdrop';
import { Disposable, DisposableCollection } from '../../common/disposable';
import { CorePreferences } from '../../common/core-preferences';
import { Emitter, Event, environment } from '../../common';
import { ToolbarAwareTabBar } from './tab-bars';
import { WIDGET_FACTORY_MIME_TYPE } from './native-tab-drag-service';

export const ACTIVE_TABBAR_CLASS = 'theia-tabBar-active';

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

    protected readonly onDidChangeCurrentEmitter = new Emitter<Title<Widget> | undefined>();
    protected disableDND: boolean | undefined = false;
    protected tabWithDNDDisabledStyling?: HTMLElement = undefined;
    /** The tab marking where a dragged tab would be inserted, see {@link showTabInsertionMarker}. */
    protected tabInsertionMarker?: { tab: Element, className: string };
    protected canDropWidget?: (widget: Widget) => boolean;
    protected onWillDropWidget?: (widget: Widget) => void;

    get onDidChangeCurrent(): Event<Title<Widget> | undefined> {
        return this.onDidChangeCurrentEmitter.event;
    }

    constructor(options?: DockPanel.IOptions,
        protected readonly preferences?: CorePreferences,
        protected readonly maximizeCallback?: (area: TheiaDockPanel) => void
    ) {
        super(options);
        this.disableDND = TheiaDockPanel.isTheiaDockPanelIOptions(options) && options.disableDragAndDrop;
        if (TheiaDockPanel.isTheiaDockPanelIOptions(options)) {
            this.canDropWidget = options.canDropWidget;
            this.onWillDropWidget = options.onWillDropWidget;
        }
        this['_onCurrentChanged'] = (sender: TabBar<Widget>, args: TabBar.ICurrentChangedArgs<Widget>) => {
            this.markAsCurrent(args.currentTitle || undefined);
            super['_onCurrentChanged'](sender, args);
        };

        this['_createTabBar'] = () => {
            // necessary for https://github.com/eclipse-theia/theia/issues/15273
            const tabBar = super['_createTabBar']();
            if (tabBar instanceof ToolbarAwareTabBar) {
                tabBar.setDockPanel(this);
                if (!this.disableDND) {
                    tabBar.enableNativeTabDrag();
                }
            }
            if (this.disableDND) {
                tabBar['tabDetachRequested'].disconnect(this['_onTabDetachRequested'], this);
                tabBar['tabDetachRequested'].connect(this.onTabDetachRequestedWithDisabledDND, this);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any, no-null/no-null
                let dragDataValue: any = null;
                Object.defineProperty(tabBar, '_dragData', {
                    get: () => dragDataValue,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    set: (value: any) => {
                        dragDataValue = value;
                        // eslint-disable-next-line no-null/no-null
                        if (value === null) {
                            this.onNullTabDragDataWithDisabledDND();
                        }
                    },
                    configurable: true
                });
            }
            return tabBar;
        };
        this['_onTabActivateRequested'] = (sender: TabBar<Widget>, args: TabBar.ITabActivateRequestedArgs<Widget>) => {
            this.markAsCurrent(args.title);
            super['_onTabActivateRequested'](sender, args);
        };
        this['_onTabCloseRequested'] = (sender: TabBar<Widget>, args: TabBar.ITabCloseRequestedArgs<Widget>) => {
            if (TheiaDockPanel.isTheiaDockPanelIOptions(options) && options.closeHandler !== undefined) {
                if (options.closeHandler(sender, args)) {
                    return;
                }
            }
            super['_onTabCloseRequested'](sender, args);
        };
    }

    protected onTabDetachRequestedWithDisabledDND(sender: TabBar<Widget>, args: TabBar.ITabDetachRequestedArgs<Widget>): void {
        // don't process the detach request at all. We still want to support other drag starts, e.g. tab reorder
        // provide visual feedback that DnD is disabled by adding not-allowed class
        const tab = sender.contentNode.children[args.index] as HTMLElement;
        if (tab) {
            tab.classList.add('theia-drag-not-allowed');
            this.tabWithDNDDisabledStyling = tab;
        }
    }

    protected onNullTabDragDataWithDisabledDND(): void {
        if (this.tabWithDNDDisabledStyling) {
            this.tabWithDNDDisabledStyling.classList.remove('theia-drag-not-allowed');
            this.tabWithDNDDisabledStyling = undefined;
        }
    }

    override handleEvent(event: globalThis.Event): void {
        switch (event.type) {
            case 'lm-dragenter':
            case 'lm-dragleave':
            case 'lm-dragover':
            case 'lm-drop':
                if (this.disableDND) {
                    return;
                }
                if ((event.type === 'lm-dragenter' || event.type === 'lm-drop') && !this.isDropAllowed(event as Drag.Event)) {
                    // not accepting the drag enter keeps this panel from becoming the drop target
                    return;
                }
                if (event.type === 'lm-drop') {
                    this.notifyWillDrop(event as Drag.Event);
                }
                if (this.handleTabBarDragEvent(event as Drag.Event)) {
                    return;
                }
                break;
        }
        super.handleEvent(event);
    }

    protected isDropAllowed(event: Drag.Event): boolean {
        const widget = this.canDropWidget && this.getDraggedWidget(event);
        return !widget || this.canDropWidget!(widget);
    }

    protected notifyWillDrop(event: Drag.Event): void {
        const widget = this.onWillDropWidget && this.getDraggedWidget(event);
        if (widget) {
            this.onWillDropWidget!(widget);
        }
    }

    /**
     * Handles dragging a widget over the tab bars of this panel: the widget is inserted as a tab where it is dropped,
     * instead of after the current tab of the tab bar as Lumino does.
     *
     * @returns `true` if the event has been handled
     */
    protected handleTabBarDragEvent(event: Drag.Event): boolean {
        if (event.type !== 'lm-dragover' && event.type !== 'lm-drop') {
            if (event.type === 'lm-dragleave' && !(event.relatedTarget && this.node.contains(event.relatedTarget as Node))) {
                this.hideTabInsertionMarker();
            }
            return false;
        }
        const tabBar = this.findTabBarAt(event.clientX, event.clientY);
        const widget = tabBar && this.getDraggedWidget(event);
        if (!tabBar || !widget) {
            this.hideTabInsertionMarker();
            return false;
        }
        event.preventDefault();
        event.stopPropagation();
        this.overlay.hide(0);
        const index = this.findTabInsertionIndex(tabBar, event.clientX);
        if (event.type === 'lm-dragover') {
            this.showTabInsertionMarker(tabBar, index);
        } else {
            this.hideTabInsertionMarker();
            this.insertTab(tabBar, index, widget);
        }
        event.dropAction = event.proposedAction;
        return true;
    }

    protected getDraggedWidget(event: Drag.Event): Widget | undefined {
        if (this['_tabsConstrained'] && event.source !== this) {
            return undefined;
        }
        const factory = event.mimeData.getData(WIDGET_FACTORY_MIME_TYPE);
        const widget = typeof factory === 'function' ? factory() : undefined;
        return widget instanceof Widget && !widget.contains(this) ? widget : undefined;
    }

    protected findTabBarAt(clientX: number, clientY: number): TabBar<Widget> | undefined {
        return find(this.tabBars(), tabBar => {
            const barRect = tabBar.node.getBoundingClientRect();
            const contentRect = tabBar.contentNode.getBoundingClientRect();
            return clientX >= barRect.left && clientX < barRect.right && clientY >= contentRect.top && clientY < contentRect.bottom;
        });
    }

    /**
     * @returns the index of the tab before which a tab dropped at the given position is inserted,
     * or the number of tabs if it is appended
     */
    protected findTabInsertionIndex(tabBar: TabBar<Widget>, clientX: number): number {
        const tabs = tabBar.contentNode.children;
        for (let i = 0; i < tabs.length; i++) {
            const rect = tabs[i].getBoundingClientRect();
            if (clientX < rect.left + rect.width / 2) {
                return i;
            }
        }
        return tabs.length;
    }

    protected insertTab(tabBar: TabBar<Widget>, index: number, widget: Widget): void {
        const titles = tabBar.titles;
        const currentIndex = titles.indexOf(widget.title);
        if (currentIndex !== -1) {
            const toIndex = index > currentIndex ? index - 1 : index;
            if (toIndex !== currentIndex) {
                tabBar.insertTab(toIndex, widget.title);
                // `insertTab` does not emit the signal that Lumino emits when a tab is moved with the pointer
                (tabBar.tabMoved as Signal<TabBar<Widget>, TabBar.ITabMovedArgs<Widget>>).emit({ fromIndex: currentIndex, toIndex, title: widget.title });
            }
        } else if (index < titles.length) {
            this.addWidget(widget, { mode: 'tab-before', ref: titles[index].owner });
        } else if (titles.length > 0) {
            this.addWidget(widget, { mode: 'tab-after', ref: titles[titles.length - 1].owner });
        } else {
            this.addWidget(widget);
        }
        this.activateWidget(widget);
    }

    protected showTabInsertionMarker(tabBar: TabBar<Widget>, index: number): void {
        const tabs = tabBar.contentNode.children;
        const tab = index < tabs.length ? tabs[index] : tabs[tabs.length - 1];
        const className = index < tabs.length ? 'theia-mod-drop-before' : 'theia-mod-drop-after';
        if (this.tabInsertionMarker?.tab === tab && this.tabInsertionMarker.className === className) {
            return;
        }
        this.hideTabInsertionMarker();
        if (tab) {
            tab.classList.add(className);
            this.tabInsertionMarker = { tab, className };
        }
    }

    protected hideTabInsertionMarker(): void {
        if (this.tabInsertionMarker) {
            this.tabInsertionMarker.tab.classList.remove(this.tabInsertionMarker.className);
            this.tabInsertionMarker = undefined;
        }
    }

    toggleMaximized(): void {
        if (this.maximizeCallback) {
            this.maximizeCallback(this);
        }
    }

    isElectron(): boolean {
        return environment.electron.is();
    }

    protected _currentTitle: Title<Widget> | undefined;
    get currentTitle(): Title<Widget> | undefined {
        return this._currentTitle;
    }

    get currentTabBar(): TabBar<Widget> | undefined {
        return this._currentTitle && this.findTabBar(this._currentTitle);
    }

    findTabBar(title: Title<Widget>): TabBar<Widget> | undefined {
        return find(this.tabBars(), bar => bar.titles.includes(title));
    }

    protected readonly toDisposeOnMarkAsCurrent = new DisposableCollection();
    markAsCurrent(title: Title<Widget> | undefined): void {
        this.toDisposeOnMarkAsCurrent.dispose();
        this._currentTitle = title;
        this.markActiveTabBar(title);
        if (title) {
            const resetCurrent = () => this.markAsCurrent(undefined);
            title.owner.disposed.connect(resetCurrent);
            this.toDisposeOnMarkAsCurrent.push(Disposable.create(() =>
                title.owner.disposed.disconnect(resetCurrent)
            ));
        }
        this.onDidChangeCurrentEmitter.fire(title);
    }

    markActiveTabBar(title?: Title<Widget>): void {
        const tabBars = toArray(this.tabBars());
        tabBars.forEach(tabBar => tabBar.removeClass(ACTIVE_TABBAR_CLASS));
        const activeTabBar = title && this.findTabBar(title);
        if (activeTabBar) {
            activeTabBar.addClass(ACTIVE_TABBAR_CLASS);
        } else if (tabBars.length > 0) {
            // At least one tabbar needs to be active
            tabBars[0].addClass(ACTIVE_TABBAR_CLASS);
        }
    }

    override addWidget(widget: Widget, options?: TheiaDockPanel.AddOptions): void {
        if (this.mode === 'single-document' && widget.parent === this) {
            return;
        }
        super.addWidget(widget, options);
        if (options?.closeRef) {
            options.ref?.close();
        }
        this.widgetAdded.emit(widget);
        this.markActiveTabBar(widget.title);
    }

    override activateWidget(widget: Widget): void {
        super.activateWidget(widget);
        this.widgetActivated.emit(widget);
        this.markActiveTabBar(widget.title);
    }

    protected override onChildRemoved(msg: Widget.ChildMessage): void {
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

    override dispose(): void {
        super.dispose();
        this.onDidChangeCurrentEmitter.dispose();
        this._currentTitle = undefined;
        this.toDisposeOnMarkAsCurrent.dispose();
    }
}
export namespace TheiaDockPanel {
    export const Factory = Symbol('TheiaDockPanel#Factory');
    export interface Factory {
        (options?: DockPanel.IOptions | TheiaDockPanel.IOptions, maximizeCallback?: (area: TheiaDockPanel) => void): TheiaDockPanel;
    }

    export interface IOptions extends DockPanel.IOptions {
        /** whether drag and drop for tabs should be disabled */
        disableDragAndDrop?: boolean;

        /**
         * @param sender the tab bar
         * @param args the widget (title)
         * @returns true if the request was handled by this handler, false if the tabbar should handle the request
         */
        closeHandler?: (sender: TabBar<Widget>, args: TabBar.ITabCloseRequestedArgs<Widget>) => boolean;

        /**
         * Whether the given widget may be dropped on this panel. By default, any widget may be dropped.
         */
        canDropWidget?: (widget: Widget) => boolean;

        /**
         * Called when the given widget is dropped on this panel, before it is added to the panel.
         */
        onWillDropWidget?: (widget: Widget) => void;
    }

    export function isTheiaDockPanelIOptions(options: DockPanel.IOptions | undefined): options is IOptions {
        if (options === undefined) {
            return false;
        }
        if ('disableDragAndDrop' in options) {
            if (options.disableDragAndDrop !== undefined && typeof options.disableDragAndDrop !== 'boolean') {
                return false;
            }
        }
        if ('closeHandler' in options) {
            if (options.closeHandler !== undefined && typeof options.closeHandler !== 'function') {
                return false;
            }
        }
        return true;
    }

    export interface AddOptions extends DockPanel.IAddOptions {
        /**
         * Whether to also close the widget referenced by `ref`.
         */
        closeRef?: boolean
    }
}
