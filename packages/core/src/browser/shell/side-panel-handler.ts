/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { find, map, toArray, some } from '@phosphor/algorithm';
import { TabBar, Widget, DockPanel, Title, Panel, BoxPanel, BoxLayout, SplitPanel, SplitLayout } from '@phosphor/widgets';
import { Signal } from '@phosphor/signaling';
import { MimeData } from '@phosphor/coreutils';
import { Drag } from '@phosphor/dragdrop';
import { AttachedProperty } from '@phosphor/properties';
import { TabBarRendererFactory, TabBarRenderer, SHELL_TABBAR_CONTEXT_MENU, SideTabBar } from './tab-bars';
import { Message } from '@phosphor/messaging';

/** The class name added to the left and right area panels. */
export const LEFT_RIGHT_AREA_CLASS = 'theia-app-sides';

/** The class name added to collapsed side panels. */
const COLLAPSED_CLASS = 'theia-mod-collapsed';

export const SidePanelHandlerFactory = Symbol('SidePanelHandlerFactory');

/**
 * A class which manages a dock panel and a related side bar. This is used for the left and right
 * panel of the application shell.
 */
@injectable()
export class SidePanelHandler {

    /**
     * A property that can be attached to widgets in order to determine the insertion index
     * of their title in the tab bar.
     */
    protected static readonly rankProperty = new AttachedProperty<Widget, number | undefined>({
        name: 'sidePanelRank',
        create: () => undefined
    });

    /**
     * The tab bar displays the titles of the widgets in the side panel. Visibility of the widgets
     * is controlled entirely through tab selection: a widget is revealed by setting the `currentTitle`
     * accordingly in the tab bar, and the panel is hidden by setting that property to `null`. The
     * tab bar itself remains visible as long as there is at least one widget.
     */
    tabBar: SideTabBar;
    /**
     * The widget container is a dock panel in `single-document` mode, which means that the panel
     * cannot be split.
     */
    dockPanel: DockPanel;
    /**
     * The panel that contains the tab bar and the dock panel. This one is hidden whenever the dock
     * panel is empty.
     */
    container: Panel;
    /**
     * The maximum ratio of the shell width that can be occupied by the side panel. This value
     * does not limit how much the panel can be manually resized, but it is considered when
     * the size of that panel is restored, e.g. when expanding the panel or reloading the page layout.
     */
    maxPanelSizeRatio = 1;
    /**
     * A promise that is resolved when the currently pending side panel updates are done.
     */
    pendingUpdate: Promise<void> = Promise.resolve();

    /**
     * The shell area where the panel is placed. This property should not be modified directly, but
     * only by calling `create`.
     */
    protected side: 'left' | 'right';
    /**
     * The index of the last tab that was selected. When the panel is expanded, it tries to restore
     * the tab selection to the previous state.
     */
    protected lastActiveTabIndex?: number;
    /**
     * The width of the panel before it was collapsed. When the panel is expanded, it tries to restore
     * its width to this value.
     */
    protected lastPanelSize?: number;

    @inject(TabBarRendererFactory) protected tabBarRendererFactory: () => TabBarRenderer;

    /**
     * Create the side bar and dock panel widgets.
     */
    create(side: 'left' | 'right'): void {
        this.side = side;
        this.tabBar = this.createSideBar();
        this.dockPanel = this.createSidePanel();
        this.container = this.createContainer();

        this.refresh();
    }

    protected createSideBar(): SideTabBar {
        const side = this.side;
        const tabBarRenderer = this.tabBarRendererFactory();
        const sideBar = new SideTabBar({
            orientation: side === 'left' || side === 'right' ? 'vertical' : 'horizontal',
            insertBehavior: 'none',
            removeBehavior: 'select-previous-tab',
            allowDeselect: false,
            tabsMovable: true,
            renderer: tabBarRenderer
        });
        tabBarRenderer.tabBar = sideBar;
        tabBarRenderer.contextMenuPath = SHELL_TABBAR_CONTEXT_MENU;
        sideBar.addClass('theia-app-' + side);
        sideBar.addClass(LEFT_RIGHT_AREA_CLASS);

        sideBar.tabAdded.connect((sender, { title }) => {
            const widget = title.owner;
            if (!some(this.dockPanel.widgets(), w => w === widget)) {
                this.dockPanel.addWidget(widget);
            }
        }, this);
        sideBar.tabActivateRequested.connect((sender, { title }) => title.owner.activate());
        sideBar.tabCloseRequested.connect((sender, { title }) => title.owner.close());
        sideBar.collapseRequested.connect(() => this.collapse(), this);
        sideBar.currentChanged.connect(this.onCurrentTabChanged, this);
        sideBar.tabDetachRequested.connect(this.onTabDetachRequested, this);
        return sideBar;
    }

    protected createSidePanel(): TheiaDockPanel {
        const sidePanel = new TheiaDockPanel({
            mode: 'single-document'
        });
        sidePanel.id = 'theia-' + this.side + '-side-panel';

        sidePanel.widgetActivated.connect((sender, widget) => {
            this.tabBar.currentTitle = widget.title;
        }, this);
        sidePanel.widgetAdded.connect(this.onWidgetAdded, this);
        sidePanel.widgetRemoved.connect(this.onWidgetRemoved, this);
        return sidePanel;
    }

    protected createContainer(): Panel {
        const side = this.side;
        let direction: BoxLayout.Direction;
        switch (side) {
            case 'left':
                direction = 'left-to-right';
                break;
            case 'right':
                direction = 'right-to-left';
                break;
            default:
                throw new Error('Illegal argument: ' + side);
        }
        const boxLayout = new BoxLayout({ direction, spacing: 0 });
        BoxPanel.setStretch(this.tabBar, 0);
        boxLayout.addWidget(this.tabBar);
        BoxPanel.setStretch(this.dockPanel, 1);
        boxLayout.addWidget(this.dockPanel);
        const boxPanel = new BoxPanel({ layout: boxLayout });
        boxPanel.id = 'theia-' + side + '-content-panel';
        return boxPanel;
    }

    /**
     * Create an object that describes the current side panel layout. This object may contain references
     * to widgets; these need to be transformed before the layout can be serialized.
     */
    getLayoutData(): SidePanel.LayoutData {
        const currentTitle = this.tabBar.currentTitle;
        const items = toArray(map(this.tabBar.titles, title => <SidePanel.WidgetItem>{
            widget: title.owner,
            rank: SidePanelHandler.rankProperty.get(title.owner),
            expanded: title === currentTitle
        }));
        const size = this.tabBar.currentTitle ? this.getPanelSize() : this.lastPanelSize;
        return { type: 'sidepanel', items, size };
    }

    /**
     * Apply a side panel layout that has been previously created with `getLayoutData`.
     */
    setLayoutData(layoutData: SidePanel.LayoutData): void {
        this.tabBar.currentTitle = null;

        let currentTitle: Title<Widget> | undefined;
        if (layoutData.items) {
            for (const { widget, rank, expanded } of layoutData.items) {
                if (widget) {
                    if (rank) {
                        SidePanelHandler.rankProperty.set(widget, rank);
                    }
                    if (expanded) {
                        currentTitle = widget.title;
                    }
                    // Add the widgets directly to the tab bar in the same order as they are stored
                    this.tabBar.addTab(widget.title);
                }
            }
        }
        if (layoutData.size) {
            this.lastPanelSize = layoutData.size;
        }

        // If the layout data contains an expanded item, update the currentTitle property
        // This implies a refresh through the `currentChanged` signal
        if (currentTitle) {
            this.tabBar.currentTitle = currentTitle;
        } else {
            this.refresh();
        }
    }

    /**
     * Activate a widget residing in the side panel by ID.
     *
     * @returns the activated widget if it was found
     */
    activate(id: string): Widget | undefined {
        const widget = this.expand(id);
        if (widget) {
            widget.activate();
        }
        return widget;
    }

    /**
     * Expand a widget residing in the side panel by ID. If no ID is given and the panel is
     * currently collapsed, the last active tab of this side panel is expanded. If no tab
     * was expanded previously, the first one is taken.
     *
     * @returns the expanded widget if it was found
     */
    expand(id?: string): Widget | undefined {
        if (id) {
            const widget = find(this.dockPanel.widgets(), w => w.id === id);
            if (widget) {
                this.tabBar.currentTitle = widget.title;
            }
            return widget;
        } else if (this.tabBar.currentTitle) {
            return this.tabBar.currentTitle.owner;
        } else if (this.tabBar.titles.length > 0) {
            let index = this.lastActiveTabIndex;
            if (!index) {
                index = 0;
            } else if (index >= this.tabBar.titles.length) {
                index = this.tabBar.titles.length - 1;
            }
            const title = this.tabBar.titles[index];
            this.tabBar.currentTitle = title;
            return title.owner;
        } else {
            // Reveal the tab bar and dock panel even if there is no widget
            // The next call to `refreshVisibility` will collapse them again
            this.container.removeClass(COLLAPSED_CLASS);
            this.container.show();
            this.tabBar.show();
            this.dockPanel.show();
            this.setPanelSize(SidePanel.EMPTY_PANEL_SIZE);
        }
    }

    /**
     * Collapse the sidebar so no items are expanded.
     */
    collapse(): void {
        if (this.tabBar.currentTitle) {
            this.tabBar.currentTitle = null;
        } else {
            this.refresh();
        }
    }

    /**
     * Add a widget and its title to the dock panel and side bar.
     *
     * If the widget is already added, it will be moved.
     */
    addWidget(widget: Widget, options: SidePanel.WidgetOptions): void {
        if (options.rank) {
            SidePanelHandler.rankProperty.set(widget, options.rank);
        }
        this.dockPanel.addWidget(widget);
    }

    /**
     * Refresh the visibility of the side bar and dock panel.
     */
    refresh(): void {
        const container = this.container;
        const tabBar = this.tabBar;
        const dockPanel = this.dockPanel;
        const hideSideBar = tabBar.titles.length === 0;
        const currentTitle = tabBar.currentTitle;
        const hideDockPanel = currentTitle === null;

        if (hideDockPanel) {
            container.addClass(COLLAPSED_CLASS);
            // Update the lastPanelSize property
            const size = this.getPanelSize();
            if (size) {
                this.lastPanelSize = size;
            }
        } else {
            container.removeClass(COLLAPSED_CLASS);
            // Try to restore the panel size
            if (dockPanel.isHidden && this.lastPanelSize) {
                this.setPanelSize(this.lastPanelSize);
            }
        }
        container.setHidden(hideSideBar && hideDockPanel);
        tabBar.setHidden(hideSideBar);
        dockPanel.setHidden(hideDockPanel);
        if (currentTitle) {
            dockPanel.selectWidget(currentTitle.owner);
        }
    }

    /**
     * Compute the current width of the panel. This implementation assumes that the parent of
     * the panel container is a `SplitPanel`.
     */
    protected getPanelSize(): number | undefined {
        const parent = this.container.parent;
        if (parent instanceof SplitPanel && parent.isVisible) {
            const index = parent.widgets.indexOf(this.container);
            if (this.side === 'left') {
                const handle = parent.handles[index];
                if (!handle.classList.contains('p-mod-hidden')) {
                    return handle.offsetLeft;
                }
            } else if (this.side === 'right') {
                const handle = parent.handles[index - 1];
                if (!handle.classList.contains('p-mod-hidden')) {
                    const parentWidth = parent.node.clientWidth;
                    return parentWidth - handle.offsetLeft;
                }
            }
        }
    }

    /**
     * Modify the width of the panel. This implementation assumes that the parent of the panel
     * container is a `SplitPanel`.
     *
     * The actual width might differ from the value that is given here. The width of the side
     * panel is limited to a customizable ratio of the total width that is available for widgets
     * (main area plus left and right areas). Further limits may be applied by the browser according
     * to CSS `minWidth` and `maxWidth` settings.
     */
    protected setPanelSize(size: number): void {
        const parent = this.container.parent;
        if (parent instanceof SplitPanel && parent.isVisible && size > 0) {
            let index = parent.widgets.indexOf(this.container);
            if (this.side === 'right') {
                index--;
            }

            const parentWidth = parent.node.clientWidth;
            const maxWidth = parentWidth * this.maxPanelSizeRatio;
            let position: number = 0;
            if (this.side === 'left') {
                position = Math.min(size, maxWidth);
            } else if (this.side === 'right') {
                position = parentWidth - Math.min(size, maxWidth);
            }

            const promise = SidePanel.moveSplitPos(parent, index, position);
            this.pendingUpdate = this.pendingUpdate.then(() => promise);
        }
    }

    /**
     * Handle a `currentChanged` signal from the sidebar. The side panel is refreshed so it displays
     * the new selected widget.
     */
    protected onCurrentTabChanged(sender: SideTabBar, { currentTitle, currentIndex }: TabBar.ICurrentChangedArgs<Widget>): void {
        if (currentIndex >= 0) {
            this.lastActiveTabIndex = currentIndex;
        }
        this.refresh();
    }

    /**
     * Handle a `tabDetachRequested` signal from the sidebar. A drag is started so the widget can be
     * moved to another application shell area.
     */
    protected onTabDetachRequested(sender: SideTabBar,
        { title, tab, clientX, clientY }: TabBar.ITabDetachRequestedArgs<Widget>): void {
        // Release the tab bar's hold on the mouse
        sender.releaseMouse();

        // Clone the selected tab and use that as drag image
        const clonedTab = tab.cloneNode(true) as HTMLElement;
        clonedTab.style.width = null;
        clonedTab.style.height = null;
        const label = clonedTab.getElementsByClassName('p-TabBar-tabLabel')[0] as HTMLElement;
        label.style.width = null;
        label.style.height = null;

        // Create and start a drag to move the selected tab to another panel
        const mimeData = new MimeData();
        mimeData.setData('application/vnd.phosphor.widget-factory', () => title.owner);
        const drag = new Drag({
            mimeData,
            dragImage: clonedTab,
            proposedAction: 'move',
            supportedActions: 'move',
        });

        tab.classList.add('p-mod-hidden');
        drag.start(clientX, clientY).then(() => {
            // The promise is resolved when the drag has ended
            tab.classList.remove('p-mod-hidden');
        });
    }

    /*
     * Handle the `widgetAdded` signal from the dock panel. The widget's title is inserted into the
     * tab bar according to the `rankProperty` value that may be attached to the widget.
     */
    protected onWidgetAdded(sender: DockPanel, widget: Widget): void {
        const titles = this.tabBar.titles;
        if (!find(titles, t => t.owner === widget)) {
            const rank = SidePanelHandler.rankProperty.get(widget);
            let index = titles.length;
            if (rank !== undefined) {
                for (let i = index - 1; i >= 0; i--) {
                    const r = SidePanelHandler.rankProperty.get(titles[i].owner);
                    if (r !== undefined && r > rank) {
                        index = i;
                    }
                }
            }
            this.tabBar.insertTab(index, widget.title);
            this.refresh();
        }
    }

    /*
     * Handle the `widgetRemoved` signal from the dock panel. The widget's title is also removed
     * from the tab bar.
     */
    protected onWidgetRemoved(sender: DockPanel, widget: Widget): void {
        this.tabBar.removeTab(widget.title);
        this.refresh();
    }

}

export namespace SidePanel {
    /**
     * The options for adding a widget to a side panel.
     */
    export interface WidgetOptions {
        /**
         * The rank order of the widget among its siblings.
         */
        rank?: number;
    }

    /**
     * Data to save and load the layout of a side panel.
     */
    export interface LayoutData {
        type: 'sidepanel',
        items?: WidgetItem[];
        size?: number;
    }

    /**
     * Data structure used to save and restore the side panel layout.
     */
    export interface WidgetItem extends WidgetOptions {
        /** Can be undefined in case the widget could not be restored. */
        widget?: Widget;
        expanded?: boolean;
    }

    /** How large the panel should be when it's expanded and empty. */
    export const EMPTY_PANEL_SIZE = 100;

    const splitMoves: { parent: SplitPanel, index: number, position: number, resolve: () => void }[] = [];

    /**
     * Move a handle of a split panel to the given position asynchronously. This function makes sure
     * that only one such movement is done in each animation frame in order to prevent the movements
     * from overriding each other.
     */
    export function moveSplitPos(parent: SplitPanel, index: number, position: number): Promise<void> {
        return new Promise<void>(resolve => {
            if (splitMoves.length === 0) {
                const callback = () => {
                    const move = splitMoves.splice(0, 1)[0];
                    (move.parent.layout as SplitLayout).moveHandle(move.index, move.position);
                    move.resolve();
                    if (splitMoves.length > 0) {
                        window.requestAnimationFrame(callback);
                    }
                };
                window.requestAnimationFrame(callback);
            }
            splitMoves.push({ parent, index, position, resolve });
        });
    }
}

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

    protected onFitRequest(msg: Message): void {
        super.onFitRequest(msg);
        if (this.isEmpty) {
            // Set a minimal size explicitly if the panel is empty
            const minSizeValue = `${SidePanel.EMPTY_PANEL_SIZE}px`;
            this.node.style.minWidth = minSizeValue;
            this.node.style.minHeight = minSizeValue;
        }
    }

}
