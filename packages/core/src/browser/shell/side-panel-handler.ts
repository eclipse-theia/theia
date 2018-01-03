/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { ArrayExt, find } from '@phosphor/algorithm';
import { StackedPanel, TabBar, Title, Widget } from '@phosphor/widgets';
import { TabBarRendererFactory, TabBarRenderer, SHELL_TABBAR_CONTEXT_MENU } from './tab-bars';

/** The class name added to the main and bottom area panels. */
export const MAIN_BOTTOM_AREA_CLASS = 'theia-app-centers';
/** The class name added to the left and right area panels. */
export const LEFT_RIGHT_AREA_CLASS = 'theia-app-sides';

/** The class name added to collapsed side panels. */
const COLLAPSED_CLASS = 'theia-mod-collapsed';

export const SidePanelHandlerFactory = Symbol('SidePanelHandlerFactory');

/**
 * A class which manages a stacked panel and a related side bar.
 */
@injectable()
export class SidePanelHandler {

    @inject(TabBarRendererFactory) protected tabBarRendererFactory: () => TabBarRenderer;

    private readonly items = new Array<SidePanel.StackedWidget>();

    protected side: 'left' | 'right' | 'bottom';

    sideBar: TabBar<Widget>;
    stackedPanel: StackedPanel;

    /**
     * Create the side bar and stacked panel widgets.
     */
    create(side: 'left' | 'right' | 'bottom') {
        this.side = side;
        const tabBarRenderer = this.tabBarRendererFactory();
        const sideBar = this.sideBar = new TabBar<Widget>({
            orientation: side === 'left' || side === 'right' ? 'vertical' : 'horizontal',
            insertBehavior: 'none',
            removeBehavior: 'none',
            allowDeselect: true,
            renderer: tabBarRenderer
        });
        tabBarRenderer.tabBar = sideBar;
        tabBarRenderer.contextMenuPath = SHELL_TABBAR_CONTEXT_MENU;
        sideBar.addClass('theia-app-' + side);
        if (side === 'left' || side === 'right') {
            sideBar.addClass(LEFT_RIGHT_AREA_CLASS);
        } else {
            sideBar.addClass(MAIN_BOTTOM_AREA_CLASS);
        }
        sideBar.currentChanged.connect(this.onCurrentChanged, this);
        sideBar.tabActivateRequested.connect(this.onTabActivateRequested, this);
        sideBar.tabCloseRequested.connect(this.onTabCloseRequested, this);

        const stackedPanel = this.stackedPanel = new StackedPanel();
        stackedPanel.id = 'theia-' + side + '-stack';
        stackedPanel.widgetRemoved.connect(this.onWidgetRemoved, this);

        this.refreshVisibility();
    }

    getLayoutData(): SidePanel.LayoutData {
        const currentTitle = this.sideBar.currentTitle;
        const items = this.items.map(item => <SidePanel.StackedWidget>{
            ...item,
            expanded: item.widget.title === currentTitle
        });
        return { type: 'sidebar', items };
    }

    setLayoutData(layoutData: SidePanel.LayoutData) {
        this.sideBar.currentTitle = null;
        if (layoutData.items) {
            for (const item of layoutData.items) {
                if (item.widget) {
                    this.addWidget(item.widget, item);
                    if (item.expanded) {
                        this.sideBar.currentTitle = item.widget.title;
                    }
                }
            }
        }
        this.refreshVisibility();
    }

    /**
     * Activate a widget residing in the side bar by ID.
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
     * Expand a widget residing in the side bar by ID.
     *
     * @returns the expanded widget if it was found
     */
    expand(id: string): Widget | undefined {
        const widget = this.findWidgetById(id);
        if (widget) {
            this.sideBar.currentTitle = widget.title;
            this.refreshVisibility();
        }
        return widget;
    }

    /**
     * Collapse the sidebar so no items are expanded.
     */
    collapse(): void {
        this.sideBar.currentTitle = null;
        this.refreshVisibility();
    }

    /**
     * Add a widget and its title to the stacked panel and side bar.
     *
     * If the widget is already added, it will be moved.
     */
    addWidget(widget: Widget, options: SidePanel.WidgetOptions): void {
        widget.parent = null;
        widget.hide();
        const item = { widget, rank: this.getRank(options) };
        const index = ArrayExt.upperBound(this.items, item, (first, second) => first.rank - second.rank);
        ArrayExt.insert(this.items, index, item);
        this.stackedPanel.insertWidget(index, widget);
        this.sideBar.insertTab(index, widget.title);
        this.refreshVisibility();
    }

    protected getRank(options: SidePanel.WidgetOptions): number {
        if (options.rank !== undefined) {
            return options.rank;
        }
        if (this.items.length > 0) {
            return this.items[this.items.length - 1].rank + 100;
        }
        return 100;
    }

    /**
     * Refresh the visibility of the side bar and stacked panel.
     */
    protected refreshVisibility(): void {
        const hideSideBar = this.sideBar.titles.length === 0;
        this.sideBar.setHidden(hideSideBar);
        const hideStack = this.sideBar.currentTitle === null;
        this.stackedPanel.setHidden(hideStack);
        if (this.stackedPanel.parent) {
            this.stackedPanel.parent.setHidden(hideSideBar && hideStack);
            if (hideStack) {
                this.stackedPanel.parent.addClass(COLLAPSED_CLASS);
            } else {
                this.stackedPanel.parent.removeClass(COLLAPSED_CLASS);
            }
        }
    }

    /**
     * Find the widget which owns the given title, or `undefined`.
     */
    protected findWidgetByTitle(title: Title<Widget> | null): Widget | undefined {
        const item = find(this.items, value => value.widget.title === title);
        return item ? item.widget : undefined;
    }

    /**
     * Find the widget with the given id, or `undefined`.
     */
    protected findWidgetById(id: string): Widget | undefined {
        const item = find(this.items, value => value.widget.id === id);
        return item ? item.widget : undefined;
    }

    /**
     * Handle the `currentChanged` signal from the sidebar.
     */
    protected onCurrentChanged(sender: TabBar<Widget>, args: TabBar.ICurrentChangedArgs<Widget>): void {
        const oldWidget = this.findWidgetByTitle(args.previousTitle);
        const newWidget = this.findWidgetByTitle(args.currentTitle);
        if (oldWidget) {
            oldWidget.hide();
        }
        if (newWidget) {
            newWidget.show();
        }
        if (newWidget) {
            document.body.setAttribute(`data-${this.side}Area`, newWidget.id);
        } else {
            document.body.removeAttribute(`data-${this.side}Area`);
        }
        this.refreshVisibility();
    }

    /**
     * Handle a `tabActivateRequest` signal from the sidebar.
     */
    protected onTabActivateRequested(sender: TabBar<Widget>, args: TabBar.ITabActivateRequestedArgs<Widget>): void {
        args.title.owner.activate();
    }

    /**
     * Handle a `tabCloseRequest` signal from the sidebar.
     */
    protected onTabCloseRequested(sender: TabBar<Widget>, args: TabBar.ITabCloseRequestedArgs<Widget>): void {
        args.title.owner.close();
    }

    /*
     * Handle the `widgetRemoved` signal from the stacked panel.
     */
    protected onWidgetRemoved(sender: StackedPanel, widget: Widget): void {
        const items = this.items;
        const index = ArrayExt.findFirstIndex(this.items, item => item.widget === widget);
        ArrayExt.removeAt(items, index);
        const shouldUpdateCurrent = this.sideBar.currentTitle === widget.title && this.side === 'bottom';
        this.sideBar.removeTab(widget.title);
        if (shouldUpdateCurrent) {
            if (index < items.length) {
                this.sideBar.currentTitle = items[index].widget.title;
            } else if (items.length > 0) {
                this.sideBar.currentTitle = items[items.length - 1].widget.title;
            }
        }
        this.refreshVisibility();
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
        type: 'sidebar',
        items?: StackedWidget[];
    }

    /**
     * An object which holds a widget and its sort rank.
     */
    export interface StackedWidget {
        widget: Widget;

        /**
         * The rank order of the widget among its siblings.
         */
        rank: number;

        /**
         * Whether the widget is expanded.
         */
        expanded?: boolean;
    }
}
