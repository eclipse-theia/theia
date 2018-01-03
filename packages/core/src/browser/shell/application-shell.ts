/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, optional } from 'inversify';
import { ArrayExt, find, toArray } from '@phosphor/algorithm';
import { Signal } from '@phosphor/signaling';
import {
    BoxLayout, BoxPanel, DockLayout, DockPanel, FocusTracker, Layout, Panel, SplitLayout,
    SplitPanel, TabBar, Widget, Title
} from '@phosphor/widgets';
import { Saveable } from '../saveable';
import { StatusBarImpl, StatusBarLayoutData } from '../status-bar/status-bar';
import { SidePanelHandler, SidePanel, MAIN_BOTTOM_AREA_CLASS, SidePanelHandlerFactory } from './side-panel-handler';
import { TabBarRendererFactory, TabBarRenderer, SHELL_TABBAR_CONTEXT_MENU } from './tab-bars';

/** The class name added to ApplicationShell instances. */
const APPLICATION_SHELL_CLASS = 'theia-ApplicationShell';
/** The class name added to the main area panel. */
const MAIN_AREA_CLASS = 'theia-app-main';
/** The class name added to the current widget's title. */
const CURRENT_CLASS = 'theia-mod-current';
/** The class name added to the active widget's title. */
const ACTIVE_CLASS = 'theia-mod-active';

export const ApplicationShellOptions = Symbol('ApplicationShellOptions');

@injectable()
export class DockPanelRenderer implements DockLayout.IRenderer {

    constructor(
        @inject(TabBarRendererFactory) protected readonly tabBarRendererFactory: () => TabBarRenderer
    ) { }

    createTabBar(): TabBar<Widget> {
        const renderer = this.tabBarRendererFactory();
        const tabBar = new TabBar<Widget>({ renderer });
        tabBar.addClass(MAIN_AREA_CLASS);
        tabBar.addClass(MAIN_BOTTOM_AREA_CLASS);
        renderer.tabBar = tabBar;
        renderer.contextMenuPath = SHELL_TABBAR_CONTEXT_MENU;
        return tabBar;
    }

    createHandle(): HTMLDivElement {
        return DockPanel.defaultRenderer.createHandle();
    }
}

/**
 * The application shell.
 */
@injectable()
export class ApplicationShell extends Widget {

    protected mainPanel: DockPanel;
    protected topPanel: Panel;
    protected leftPanelHandler: SidePanelHandler;
    protected rightPanelHandler: SidePanelHandler;
    protected bottomPanelHandler: SidePanelHandler;

    private readonly tracker = new FocusTracker<Widget>();

    readonly currentChanged = new Signal<this, FocusTracker.IChangedArgs<Widget>>(this);
    readonly activeChanged = new Signal<this, FocusTracker.IChangedArgs<Widget>>(this);

    /**
     * Construct a new application shell.
     */
    constructor(
        @inject(DockPanelRenderer) dockPanelRenderer: DockPanelRenderer,
        @inject(SidePanelHandlerFactory) sidePanelHandlerFactory: () => SidePanelHandler,
        @inject(StatusBarImpl) protected readonly statusBar: StatusBarImpl,
        @inject(ApplicationShellOptions) @optional() options?: Widget.IOptions | undefined
    ) {
        super(options);
        this.addClass(APPLICATION_SHELL_CLASS);
        this.id = 'theia-app-shell';

        this.topPanel = this.createTopPanel();
        this.mainPanel = this.createMainPanel(dockPanelRenderer);
        this.leftPanelHandler = sidePanelHandlerFactory();
        this.leftPanelHandler.create('left');
        this.rightPanelHandler = sidePanelHandlerFactory();
        this.rightPanelHandler.create('right');
        this.bottomPanelHandler = sidePanelHandlerFactory();
        this.bottomPanelHandler.create('bottom');
        this.layout = this.createLayout();

        this.tracker.currentChanged.connect(this.onCurrentChanged, this);
        this.tracker.activeChanged.connect(this.onActiveChanged, this);
    }

    /**
     * Create the top panel, which is used to hold the main menu.
     */
    protected createTopPanel(): Panel {
        const topPanel = new Panel();
        topPanel.id = 'theia-top-panel';
        return topPanel;
    }

    /**
     * Create the dock panel, which holds the main area for widgets organized with tabs.
     */
    protected createMainPanel(dockPanelRenderer: DockPanelRenderer): DockPanel {
        const dockPanel = new DockPanel({ renderer: dockPanelRenderer });
        dockPanel.id = 'theia-main-content-panel';
        dockPanel.spacing = 0;
        return dockPanel;
    }

    /**
     * Create a panel that arranges a side bar around the given main area.
     */
    protected createSideBarLayout(side: ApplicationShell.Area, mainArea: Widget): Panel {
        const spacing = 0;
        let boxLayout: BoxLayout;
        switch (side) {
            case 'left':
                boxLayout = this.createBoxLayout([this.leftPanelHandler.sideBar, this.leftPanelHandler.stackedPanel], [0, 1],
                    { direction: 'left-to-right', spacing });
                break;
            case 'right':
                boxLayout = this.createBoxLayout([this.rightPanelHandler.stackedPanel, this.rightPanelHandler.sideBar], [1, 0],
                    { direction: 'left-to-right', spacing });
                break;
            case 'bottom':
                boxLayout = this.createBoxLayout([this.bottomPanelHandler.sideBar, this.bottomPanelHandler.stackedPanel], [0, 1],
                    { direction: 'top-to-bottom', spacing });
                break;
            default:
                throw new Error('Illegal argument: ' + side);
        }
        const boxPanel = new BoxPanel({ layout: boxLayout });
        boxPanel.id = 'theia-' + side + '-content-panel';
        boxPanel.hide();

        let splitLayout: SplitLayout;
        switch (side) {
            case 'left':
                splitLayout = this.createSplitLayout([boxPanel, mainArea], [0, 1], { orientation: 'horizontal', spacing });
                break;
            case 'right':
                splitLayout = this.createSplitLayout([mainArea, boxPanel], [1, 0], { orientation: 'horizontal', spacing });
                break;
            case 'bottom':
                splitLayout = this.createSplitLayout([mainArea, boxPanel], [1, 0], { orientation: 'vertical', spacing });
                break;
            default:
                throw new Error('Illegal argument: ' + side);
        }
        const splitPanel = new SplitPanel({ layout: splitLayout });
        splitPanel.id = 'theia-' + side + '-split-panel';
        return splitPanel;
    }

    /**
     * Create a box layout to assemble the application shell layout.
     */
    protected createBoxLayout(widgets: Widget[], stretch?: number[], options?: BoxPanel.IOptions): BoxLayout {
        const boxLayout = new BoxLayout(options);
        for (let i = 0; i < widgets.length; i++) {
            if (stretch !== undefined && i < stretch.length) {
                BoxPanel.setStretch(widgets[i], stretch[i]);
            }
            boxLayout.addWidget(widgets[i]);
        }
        return boxLayout;
    }

    /**
     * Create a split layout to assemble the application shell layout.
     */
    protected createSplitLayout(widgets: Widget[], stretch?: number[], options?: Partial<SplitLayout.IOptions>): SplitLayout {
        let optParam: SplitLayout.IOptions = { renderer: SplitPanel.defaultRenderer, };
        if (options) {
            optParam = { ...optParam, ...options };
        }
        const splitLayout = new SplitLayout(optParam);
        for (let i = 0; i < widgets.length; i++) {
            if (stretch !== undefined && i < stretch.length) {
                SplitPanel.setStretch(widgets[i], stretch[i]);
            }
            splitLayout.addWidget(widgets[i]);
        }
        return splitLayout;
    }

    /**
     * Assemble the application shell layout. Override this method in order to change the arrangement
     * of the main area and the side bars.
     */
    protected createLayout(): Layout {
        const panelForBottomSideBar = this.createSideBarLayout('bottom', this.mainPanel);
        const panelForRightSideBar = this.createSideBarLayout('right', panelForBottomSideBar);
        const panelForLeftSideBar = this.createSideBarLayout('left', panelForRightSideBar);

        return this.createBoxLayout(
            [this.topPanel, panelForLeftSideBar, this.statusBar],
            [0, 1, 0],
            { direction: 'top-to-bottom', spacing: 0 }
        );
    }

    getLayoutData(): ApplicationShell.LayoutData {
        return {
            mainArea: this.mainPanel.saveLayout(),
            leftPanel: this.leftPanelHandler.getLayoutData(),
            rightPanel: this.rightPanelHandler.getLayoutData(),
            bottomPanel: this.bottomPanelHandler.getLayoutData(),
            statusBar: this.statusBar.getLayoutData()
        };
    }

    setLayoutData(layoutData: ApplicationShell.LayoutData): void {
        if (layoutData.mainArea) {
            this.mainPanel.restoreLayout(layoutData.mainArea);
            this.registerWithFocusTracker(layoutData.mainArea.main);
        }
        if (layoutData.leftPanel) {
            this.leftPanelHandler.setLayoutData(layoutData.leftPanel);
            this.registerWithFocusTracker(layoutData.leftPanel);
        }
        if (layoutData.rightPanel) {
            this.rightPanelHandler.setLayoutData(layoutData.rightPanel);
            this.registerWithFocusTracker(layoutData.rightPanel);
        }
        if (layoutData.bottomPanel) {
            this.bottomPanelHandler.setLayoutData(layoutData.bottomPanel);
            this.registerWithFocusTracker(layoutData.bottomPanel);
        }
        if (layoutData.statusBar) {
            this.statusBar.setLayoutData(layoutData.statusBar);
        }
    }

    protected registerWithFocusTracker(data: DockLayout.ITabAreaConfig | DockLayout.ISplitAreaConfig | SidePanel.LayoutData | null): void {
        if (data) {
            if (data.type === 'tab-area') {
                for (const widget of data.widgets) {
                    this.track(widget);
                }
            } else if (data.type === 'split-area') {
                for (const child of data.children) {
                    this.registerWithFocusTracker(child);
                }
            } else if (data.type === 'sidebar' && data.items) {
                for (const item of data.items) {
                    this.track(item.widget);
                }
            }
        }
    }

    /**
     * Add a widget to the application shell. The given widget must have a unique `id` property,
     * which will be used as the DOM id.
     *
     * All widgets added to the main area should be disposed after removal (or
     * simply disposed in order to remove).
     *
     * Widgets added to the top area are not tracked regarding the _current_ and _active_ states.
     */
    addWidget(widget: Widget, options: ApplicationShell.WidgetOptions) {
        if (!widget.id) {
            console.error('Widgets added to the application shell must have a unique id property.');
            return;
        }
        switch (options.area) {
            case 'main':
                if (!options.mode) {
                    options.mode = 'tab-after';
                }
                this.mainPanel.addWidget(widget, options);
                break;
            case 'top':
                this.topPanel.addWidget(widget);
                break;
            case 'left':
                this.leftPanelHandler.addWidget(widget, options);
                break;
            case 'right':
                this.rightPanelHandler.addWidget(widget, options);
                break;
            case 'bottom':
                this.bottomPanelHandler.addWidget(widget, options);
                break;
            default:
                throw new Error('Illegal argument: ' + options.area);
        }
        if (options.area !== 'top') {
            this.track(widget);
        }
    }

    /**
     * The widgets contained in the given shell area.
     */
    getWidgets(area: ApplicationShell.Area): Widget[] {
        switch (area) {
            case 'main':
                return toArray(this.mainPanel.widgets());
            case 'top':
                return toArray(this.topPanel.widgets);
            case 'left':
                return toArray(this.leftPanelHandler.stackedPanel.widgets);
            case 'right':
                return toArray(this.rightPanelHandler.stackedPanel.widgets);
            case 'bottom':
                return toArray(this.bottomPanelHandler.stackedPanel.widgets);
            default:
                throw new Error('Illegal argument: ' + area);
        }
    }

    /**
     * The current widget in the application shell. The current widget is the last widget that
     * was active and not yet closed.
     */
    get currentWidget(): Widget | undefined {
        return this.tracker.currentWidget || undefined;
    }

    /**
     * The active widget in the application shell. The active widget is the one that has focus
     * (either the widget itself or any of its contents).
     */
    get activeWidget(): Widget | undefined {
        return this.tracker.activeWidget || undefined;
    }

    /**
     * Handle a change to the current widget.
     */
    private onCurrentChanged(sender: any, args: FocusTracker.IChangedArgs<Widget>): void {
        if (args.newValue) {
            args.newValue.title.className += ` ${CURRENT_CLASS}`;
        }
        if (args.oldValue) {
            args.oldValue.title.className = args.oldValue.title.className.replace(CURRENT_CLASS, '');
        }
        this.currentChanged.emit(args);
    }

    /**
     * Handle a change to the active widget.
     */
    private onActiveChanged(sender: any, args: FocusTracker.IChangedArgs<Widget>): void {
        if (args.newValue) {
            args.newValue.title.className += ` ${ACTIVE_CLASS}`;
        }
        if (args.oldValue) {
            args.oldValue.title.className = args.oldValue.title.className.replace(ACTIVE_CLASS, '');
        }
        this.activeChanged.emit(args);
    }

    /**
     * Track the given widget so it is considered in the `current` and `active` state of the shell.
     */
    protected track(widget: Widget): void {
        this.tracker.add(widget);
        Saveable.apply(widget);
    }

    /**
     * Activate a widget in the application shell.
     *
     * @returns the activated widget if it was found
     */
    activateWidget(id: string): Widget | undefined {
        let widget = find(this.mainPanel.widgets(), w => w.id === id);
        if (widget) {
            this.mainPanel.activateWidget(widget);
            return widget;
        }
        widget = this.leftPanelHandler.activate(id);
        if (widget) {
            return widget;
        }
        widget = this.rightPanelHandler.activate(id);
        if (widget) {
            return widget;
        }
        widget = this.bottomPanelHandler.activate(id);
        if (widget) {
            return widget;
        }
    }

    /**
     * Collapse the given side panel area.
     */
    collapseSidePanel(area: ApplicationShell.Area): void {
        switch (area) {
            case 'left':
                this.leftPanelHandler.collapse();
                break;
            case 'right':
                this.rightPanelHandler.collapse();
                break;
            case 'bottom':
                this.bottomPanelHandler.collapse();
                break;
            default:
                throw new Error('Area cannot be collapsed: ' + area);
        }
    }

    closeTabs(tabBarOrArea: TabBar<Widget> | ApplicationShell.Area,
        filter?: (title: Title<Widget>, index: number) => boolean): void {
        if (tabBarOrArea === 'main') {
            this.mainAreaTabBars.forEach(tb => this.closeTabs(tb, filter));
        } else if (typeof tabBarOrArea === 'string') {
            const tabBar = this.getTabBarFor(tabBarOrArea);
            if (tabBar) {
                this.closeTabs(tabBar, filter);
            }
        } else if (tabBarOrArea) {
            const titles = toArray(tabBarOrArea.titles);
            for (let i = 0; i < titles.length; i++) {
                if (filter === undefined || filter(titles[i], i)) {
                    titles[i].owner.close();
                }
            }
        }
    }

    /**
     * Return the area of the currently active tab.
     */
    get currentTabArea(): ApplicationShell.Area | undefined {
        const currentWidget = this.currentWidget;
        if (currentWidget) {
            const currentTitle = currentWidget.title;
            const mainPanelTabBar = find(this.mainPanel.tabBars(), bar => ArrayExt.firstIndexOf(bar.titles, currentTitle) > -1);
            if (mainPanelTabBar) {
                return 'main';
            }
            if (ArrayExt.firstIndexOf(this.leftPanelHandler.sideBar.titles, currentTitle) > -1) {
                return 'left';
            }
            if (ArrayExt.firstIndexOf(this.rightPanelHandler.sideBar.titles, currentTitle) > -1) {
                return 'right';
            }
            if (ArrayExt.firstIndexOf(this.bottomPanelHandler.sideBar.titles, currentTitle) > -1) {
                return 'bottom';
            }
        }
    }

    /**
     * Return the TabBar that has the currently active Widget, or undefined.
     */
    get currentTabBar(): TabBar<Widget> | undefined {
        const currentWidget = this.currentWidget;
        if (currentWidget) {
            return this.getTabBarFor(currentWidget);
        }
    }

    /**
     * Return the TabBar in the given shell area, or the TabBar that has the given widget, or undefined.
     */
    getTabBarFor(widgetOrArea: Widget | ApplicationShell.Area): TabBar<Widget> | undefined {
        if (typeof widgetOrArea === 'string') {
            switch (widgetOrArea) {
                case 'main':
                    return this.mainPanel.tabBars().next();
                case 'left':
                    return this.leftPanelHandler.sideBar;
                case 'right':
                    return this.rightPanelHandler.sideBar;
                case 'bottom':
                    return this.bottomPanelHandler.sideBar;
                default:
                    throw new Error('Illegal argument: ' + widgetOrArea);
            }
        } else if (widgetOrArea && widgetOrArea.isAttached) {
            const widgetTitle = widgetOrArea.title;
            const mainPanelTabBar = find(this.mainPanel.tabBars(), bar => ArrayExt.firstIndexOf(bar.titles, widgetTitle) > -1);
            if (mainPanelTabBar) {
                return mainPanelTabBar;
            }
            const leftPanelTabBar = this.leftPanelHandler.sideBar;
            if (ArrayExt.firstIndexOf(leftPanelTabBar.titles, widgetTitle) > -1) {
                return leftPanelTabBar;
            }
            const rightPanelTabBar = this.rightPanelHandler.sideBar;
            if (ArrayExt.firstIndexOf(rightPanelTabBar.titles, widgetTitle) > -1) {
                return rightPanelTabBar;
            }
            const bottomPanelTabBar = this.bottomPanelHandler.sideBar;
            if (ArrayExt.firstIndexOf(bottomPanelTabBar.titles, widgetTitle) > -1) {
                return bottomPanelTabBar;
            }
        }
    }

    get mainAreaTabBars(): TabBar<Widget>[] {
        return toArray(this.mainPanel.tabBars());
    }

    /*
     * Activate the next tab in the current TabBar.
     */
    activateNextTab(): void {
        const current = this.currentTabBar;
        if (current) {
            const ci = current.currentIndex;
            if (ci !== -1) {
                if (ci < current.titles.length - 1) {
                    current.currentIndex += 1;
                    if (current.currentTitle) {
                        current.currentTitle.owner.activate();
                    }
                } else if (ci === current.titles.length - 1) {
                    const nextBar = this.nextTabBar(current);
                    nextBar.currentIndex = 0;
                    if (nextBar.currentTitle) {
                        nextBar.currentTitle.owner.activate();
                    }
                }
            }
        }
    }

    /**
     * Return the TabBar next to the given TabBar; return the given TabBar if there is no adjacent one.
     */
    private nextTabBar(current: TabBar<Widget>): TabBar<Widget> {
        const bars = toArray(this.mainPanel.tabBars());
        const len = bars.length;
        const ci = ArrayExt.firstIndexOf(bars, current);
        if (ci < (len - 1)) {
            return bars[ci + 1];
        } else if (ci === len - 1) {
            return bars[0];
        } else {
            return current;
        }
    }

    /*
     * Activate the previous tab in the current TabBar.
     */
    activatePreviousTab(): void {
        const current = this.currentTabBar;
        if (current) {
            const ci = current.currentIndex;
            if (ci !== -1) {
                if (ci > 0) {
                    current.currentIndex -= 1;
                    if (current.currentTitle) {
                        current.currentTitle.owner.activate();
                    }
                } else if (ci === 0) {
                    const prevBar = this.previousTabBar(current);
                    const len = prevBar.titles.length;
                    prevBar.currentIndex = len - 1;
                    if (prevBar.currentTitle) {
                        prevBar.currentTitle.owner.activate();
                    }
                }
            }
        }
    }

    /**
     * Return the TabBar previous to the given TabBar; return the given TabBar if there is no adjacent one.
     */
    private previousTabBar(current: TabBar<Widget>): TabBar<Widget> {
        const bars = toArray(this.mainPanel.tabBars());
        const len = bars.length;
        const ci = ArrayExt.firstIndexOf(bars, current);
        if (ci > 0) {
            return bars[ci - 1];
        } else if (ci === 0) {
            return bars[len - 1];
        } else {
            return current;
        }
    }

    /**
     * Test whether the current widget is dirty.
     */
    canSave(): boolean {
        return Saveable.isDirty(this.currentWidget);
    }

    /**
     * Save the current widget if it is dirty.
     */
    async save(): Promise<void> {
        await Saveable.save(this.currentWidget);
    }

    /**
     * Test whether there is a dirty widget.
     */
    canSaveAll(): boolean {
        return this.tracker.widgets.some(Saveable.isDirty);
    }

    /**
     * Save all dirty widgets.
     */
    async saveAll(): Promise<void> {
        await Promise.all(this.tracker.widgets.map(Saveable.save));
    }

}

/**
 * The namespace for `ApplicationShell` class statics.
 */
export namespace ApplicationShell {
    /**
     * The areas of the application shell where widgets can reside.
     */
    export type Area = 'main' | 'top' | 'left' | 'right' | 'bottom';

    export function isSideArea(area?: Area): area is 'left' | 'right' | 'bottom' {
        return area === 'left' || area === 'right' || area === 'bottom';
    }

    /**
     * The options for adding a widget to the application shell.
     */
    export interface WidgetOptions extends DockLayout.IAddOptions, SidePanel.WidgetOptions {
        /**
         * The area of the application shell where the widget will reside.
         */
        area: Area;
    }

    /**
     * Data to save and load the application shell layout.
     */
    export interface LayoutData {
        mainArea?: DockPanel.ILayoutConfig;
        leftPanel?: SidePanel.LayoutData;
        rightPanel?: SidePanel.LayoutData;
        bottomPanel?: SidePanel.LayoutData;
        statusBar?: StatusBarLayoutData;
    }
}
