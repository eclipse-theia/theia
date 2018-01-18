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
import { Drag } from '@phosphor/dragdrop';
import { Saveable } from '../saveable';
import { StatusBarImpl, StatusBarLayoutData } from '../status-bar/status-bar';
import { SidePanelHandler, SidePanel, SidePanelHandlerFactory, TheiaDockPanel } from './side-panel-handler';
import { TabBarRendererFactory, TabBarRenderer, SHELL_TABBAR_CONTEXT_MENU } from './tab-bars';

/** The class name added to ApplicationShell instances. */
const APPLICATION_SHELL_CLASS = 'theia-ApplicationShell';
/** The class name added to the main and bottom area panels. */
const MAIN_BOTTOM_AREA_CLASS = 'theia-app-centers';
/** The class name added to the current widget's title. */
const CURRENT_CLASS = 'theia-mod-current';
/** The class name added to the active widget's title. */
const ACTIVE_CLASS = 'theia-mod-active';

export const ApplicationShellOptions = Symbol('ApplicationShellOptions');

/**
 * A renderer for dock panels that supports context menus on tabs.
 */
@injectable()
export class DockPanelRenderer implements DockLayout.IRenderer {

    constructor(
        @inject(TabBarRendererFactory) protected readonly tabBarRendererFactory: () => TabBarRenderer
    ) { }

    createTabBar(): TabBar<Widget> {
        const renderer = this.tabBarRendererFactory();
        const tabBar = new TabBar<Widget>({ renderer });
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
 * The application shell manages the top-level widgets of the application. Use this class to
 * add, remove, or activate a widget.
 */
@injectable()
export class ApplicationShell extends Widget {

    /**
     * General options for the application shell.
     */
    protected options: ApplicationShell.Options;
    /**
     * The dock panel in the main shell area. This is where editors usually go to.
     */
    protected mainPanel: DockPanel;
    /**
     * The fixed-size panel shown on top. This one usually holds the main menu.
     */
    protected topPanel: Panel;
    /**
     * The dock panel in the bottom shell area. In contrast to the main panel, the bottom panel
     * can be collapsed and expanded.
     */
    protected bottomPanel: DockPanel;
    /**
     * Handler for the left side panel. The primary application views go here, such as the
     * file explorer and the git view.
     */
    protected leftPanelHandler: SidePanelHandler;
    /**
     * Handler for the right side panel. The secondary application views go here, such as the
     * outline view.
     */
    protected rightPanelHandler: SidePanelHandler;
    /**
     * The last known height of the bottom panel. When the bottom panel is expanded, an attempt
     * to restore its height to this value is made.
     */
    protected lastBottomPanelSize?: number;

    private readonly tracker = new FocusTracker<Widget>();
    private widgetDragListener?: (event: Event) => void;

    /**
     * Construct a new application shell.
     */
    constructor(
        @inject(DockPanelRenderer) protected dockPanelRenderer: DockPanelRenderer,
        @inject(StatusBarImpl) protected readonly statusBar: StatusBarImpl,
        @inject(SidePanelHandlerFactory) sidePanelHandlerFactory: () => SidePanelHandler,
        @inject(ApplicationShellOptions) @optional() options?: Partial<ApplicationShell.Options>
    ) {
        super(options);
        this.addClass(APPLICATION_SHELL_CLASS);
        this.id = 'theia-app-shell';

        const defaultOptions: ApplicationShell.Options = {
            sidePanelExpandThreshold: SidePanel.EMPTY_PANEL_SIZE,
            maxBottomPanelRatio: 0.67,
            maxLeftPanelRatio: 0.4,
            maxRightPanelRatio: 0.4
        };
        if (options) {
            this.options = { ...defaultOptions, ...options };
        } else {
            this.options = defaultOptions;
        }

        this.mainPanel = this.createMainPanel();
        this.topPanel = this.createTopPanel();
        this.bottomPanel = this.createBottomPanel();
        this.leftPanelHandler = sidePanelHandlerFactory();
        this.leftPanelHandler.create('left');
        this.leftPanelHandler.maxPanelSizeRatio = this.options.maxLeftPanelRatio;
        this.rightPanelHandler = sidePanelHandlerFactory();
        this.rightPanelHandler.create('right');
        this.rightPanelHandler.maxPanelSizeRatio = this.options.maxRightPanelRatio;
        this.layout = this.createLayout();

        this.tracker.currentChanged.connect(this.onCurrentChanged, this);
        this.tracker.activeChanged.connect(this.onActiveChanged, this);

        SidePanel.onDragStarted(this.onWidgetDragStarted.bind(this));
        SidePanel.onDragEnded(this.onWidgetDragEnded.bind(this));
    }

    /**
     * Create the dock panel in the main shell area.
     */
    protected createMainPanel(): DockPanel {
        const dockPanel = new TheiaDockPanel({
            mode: 'multiple-document',
            renderer: this.dockPanelRenderer,
            spacing: 0
        });
        dockPanel.id = 'theia-main-content-panel';
        return dockPanel;
    }

    /**
     * Create the dock panel in the bottom shell area.
     */
    protected createBottomPanel(): DockPanel {
        const dockPanel = new TheiaDockPanel({
            mode: 'multiple-document',
            renderer: this.dockPanelRenderer,
            spacing: 0
        });
        dockPanel.id = 'theia-bottom-content-panel';
        dockPanel.widgetRemoved.connect((sender, widget) => {
            if (dockPanel.isEmpty) {
                this.collapseBottomPanel();
            }
        }, this);
        dockPanel.panelAttached.connect(sender => {
            if (!this.bottomPanel.isHidden && this.lastBottomPanelSize) {
                this.setBottomPanelSize(this.lastBottomPanelSize);
            }
        }, this);
        dockPanel.hide();
        return dockPanel;
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
     * of the main area and the side panels.
     */
    protected createLayout(): Layout {
        const bottomSplitLayout = this.createSplitLayout(
            [this.mainPanel, this.bottomPanel],
            [1, 0],
            { orientation: 'vertical', spacing: 2 }
        );
        const panelForBottomArea = new SplitPanel({ layout: bottomSplitLayout });
        panelForBottomArea.id = 'theia-bottom-split-panel';

        const leftRightSplitLayout = this.createSplitLayout(
            [this.leftPanelHandler.container, panelForBottomArea, this.rightPanelHandler.container],
            [0, 1, 0],
            { orientation: 'horizontal', spacing: 2 }
        );
        const panelForSideAreas = new SplitPanel({ layout: leftRightSplitLayout });
        panelForSideAreas.id = 'theia-left-right-split-panel';

        return this.createBoxLayout(
            [this.topPanel, panelForSideAreas, this.statusBar],
            [0, 1, 0],
            { direction: 'top-to-bottom', spacing: 0 }
        );
    }

    /**
     * Invoked when the title of a widget is dragged away from a tab bar. This method sets up
     * a `mousemove` listener that expands side panels if necessary so the widget can be dropped
     * into them.
     */
    protected onWidgetDragStarted(drag: Drag): void {
        if (this.widgetDragListener) {
            return;
        }
        const initialPanelState = {
            leftCollapsed: this.leftPanelHandler.tabBar.currentTitle === null,
            rightCollapsed: this.rightPanelHandler.tabBar.currentTitle === null,
            bottomCollapsed: this.bottomPanel.isHidden
        };
        const modifiedPanelState = {
            leftExpanded: false,
            rightExpanded: false,
            bottomExpanded: false
        };
        this.widgetDragListener = event => {
            if (event.type === 'mousemove') {
                const { clientX, clientY } = event as MouseEvent;
                const threshold = this.options.sidePanelExpandThreshold;
                if (clientX <= threshold) {
                    // The mouse cursor is close to the left border, so expand the left panel if necessary
                    if (!modifiedPanelState.leftExpanded) {
                        this.leftPanelHandler.expand();
                        modifiedPanelState.leftExpanded = true;
                    }
                } else if (initialPanelState.leftCollapsed && modifiedPanelState.leftExpanded) {
                    // The mouse cursor is moved away from the left border
                    this.leftPanelHandler.collapse();
                    modifiedPanelState.leftExpanded = false;
                }
                if (clientX >= window.innerWidth - threshold) {
                    // The mouse cursor is close to the right border, so expand the right panel if necessary
                    if (!modifiedPanelState.rightExpanded) {
                        this.rightPanelHandler.expand();
                        modifiedPanelState.rightExpanded = true;
                    }
                } else if (initialPanelState.rightCollapsed && modifiedPanelState.rightExpanded) {
                    // The mouse cursor is moved away from the right border
                    this.rightPanelHandler.collapse();
                    modifiedPanelState.rightExpanded = false;
                }
                const statusBarHeight = this.statusBar.node.clientHeight;
                if (clientY >= window.innerHeight - threshold - statusBarHeight) {
                    // The mouse cursor is close to the bottom border, so expand the bottom panel if necessary
                    if (!modifiedPanelState.bottomExpanded) {
                        this.expandBottomPanel();
                        modifiedPanelState.bottomExpanded = true;
                    }
                } else if (initialPanelState.bottomCollapsed && modifiedPanelState.bottomExpanded) {
                    // The mouse cursor is moved away from the bottom border
                    this.collapseBottomPanel();
                    modifiedPanelState.bottomExpanded = false;
                }
            }
        };
        document.addEventListener('mousemove', this.widgetDragListener, true);
    }

    /**
     * Removes the listeners that are set up by `onWidgetDragStarted` and resets the shell to the
     * previous state.
     */
    protected onWidgetDragEnded(drag: Drag): void {
        if (this.widgetDragListener) {
            document.removeEventListener('mousemove', this.widgetDragListener, true);
            this.leftPanelHandler.refresh();
            this.rightPanelHandler.refresh();
            if (this.bottomPanel.isEmpty) {
                this.collapseBottomPanel();
            }
            this.widgetDragListener = undefined;
        }
    }

    /**
     * Create an object that describes the current shell layout. This object may contain references
     * to widgets; these need to be transformed before the layout can be serialized.
     */
    getLayoutData(): ApplicationShell.LayoutData {
        return {
            mainPanel: this.mainPanel.saveLayout(),
            bottomPanel: {
                config: this.bottomPanel.saveLayout(),
                size: this.bottomPanel.isVisible ? this.getBottomPanelSize() : this.lastBottomPanelSize,
                expanded: this.isExpanded('bottom')
            },
            leftPanel: this.leftPanelHandler.getLayoutData(),
            rightPanel: this.rightPanelHandler.getLayoutData(),
            statusBar: this.statusBar.getLayoutData()
        };
    }

    /**
     * Compute the current height of the bottom panel. This implementation assumes that the container
     * of the bottom panel is a `SplitPanel`.
     */
    protected getBottomPanelSize(): number | undefined {
        const parent = this.bottomPanel.parent;
        if (parent instanceof SplitPanel && parent.isVisible) {
            const index = parent.widgets.indexOf(this.bottomPanel) - 1;
            if (index >= 0) {
                const handle = parent.handles[index];
                if (!handle.classList.contains('p-mod-hidden')) {
                    const parentHeight = parent.node.clientHeight;
                    return parentHeight - handle.offsetTop;
                }
            }
        }
    }

    /**
     * Apply a shell layout that has been previously created with `getLayoutData`.
     */
    setLayoutData({ mainPanel, bottomPanel, leftPanel, rightPanel, statusBar }: ApplicationShell.LayoutData): void {
        if (mainPanel) {
            this.mainPanel.restoreLayout(mainPanel);
            this.registerWithFocusTracker(mainPanel.main);
        }
        if (bottomPanel) {
            if (bottomPanel.config) {
                this.bottomPanel.restoreLayout(bottomPanel.config);
                this.registerWithFocusTracker(bottomPanel.config.main);
            }
            if (bottomPanel.size) {
                this.lastBottomPanelSize = bottomPanel.size;
            }
            if (bottomPanel.expanded) {
                this.expandBottomPanel();
            } else {
                this.collapseBottomPanel();
            }
        }
        if (leftPanel) {
            this.leftPanelHandler.setLayoutData(leftPanel);
            this.registerWithFocusTracker(leftPanel);
        }
        if (rightPanel) {
            this.rightPanelHandler.setLayoutData(rightPanel);
            this.registerWithFocusTracker(rightPanel);
        }
        if (statusBar) {
            this.statusBar.setLayoutData(statusBar);
        }
    }

    /**
     * Modify the height of the bottom panel. This implementation assumes that the container of the
     * bottom panel is a `SplitPanel`.
     *
     * The actual height might differ from the value that is given here. The height of the bottom
     * panel is limited to a customizable ratio of the total height that is available for widgets
     * (main area plus bottom area). Further limits may be applied by the browser according to CSS
     * `minHeight` and `maxHeight` settings.
     */
    protected setBottomPanelSize(size: number): void {
        const parent = this.bottomPanel.parent;
        if (parent instanceof SplitPanel && parent.isVisible) {
            const index = parent.widgets.indexOf(this.bottomPanel) - 1;
            if (index >= 0) {
                const parentHeight = parent.node.clientHeight;
                const maxHeight = parentHeight * this.options.maxBottomPanelRatio;
                const position = parentHeight - Math.min(size, maxHeight);
                SidePanel.moveSplitPos(parent, index, position);
            }
        }
    }

    /**
     * Track all widgets that are referenced by the given layout data.
     */
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
            } else if (data.type === 'sidepanel' && data.items) {
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
     * Widgets are removed from the shell by calling their `close` or `dispose` methods.
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
                this.mainPanel.addWidget(widget, options);
                break;
            case 'top':
                this.topPanel.addWidget(widget);
                break;
            case 'bottom':
                this.bottomPanel.addWidget(widget, options);
                break;
            case 'left':
                this.leftPanelHandler.addWidget(widget, options);
                break;
            case 'right':
                this.rightPanelHandler.addWidget(widget, options);
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
            case 'bottom':
                return toArray(this.bottomPanel.widgets());
            case 'left':
                return toArray(this.leftPanelHandler.dockPanel.widgets());
            case 'right':
                return toArray(this.rightPanelHandler.dockPanel.widgets());
            default:
                throw new Error('Illegal argument: ' + area);
        }
    }

    /**
     * The current widget in the application shell. The current widget is the last widget that
     * was active and not yet closed. See the remarks to `activeWidget` on what _active_ means.
     */
    get currentWidget(): Widget | undefined {
        return this.tracker.currentWidget || undefined;
    }

    /**
     * The active widget in the application shell. The active widget is the one that has focus
     * (either the widget itself or any of its contents).
     *
     * _Note:_ Focus is taken by a widget through the `onActivateRequest` method. It is up to the
     * widget implementation which DOM element will get the focus. The default implementation
     * does not take any focus; in that case the widget is never returned by this property.
     */
    get activeWidget(): Widget | undefined {
        return this.tracker.activeWidget || undefined;
    }

    /**
     * A signal emitted whenever the `currentWidget` property is changed.
     */
    readonly currentChanged = new Signal<this, FocusTracker.IChangedArgs<Widget>>(this);

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
     * A signal emitted whenever the `activeWidget` property is changed.
     */
    readonly activeChanged = new Signal<this, FocusTracker.IChangedArgs<Widget>>(this);

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
     * Activate a widget in the application shell. This makes the widget visible and usually
     * also assigns focus to it.
     *
     * _Note:_ Focus is taken by a widget through the `onActivateRequest` method. It is up to the
     * widget implementation which DOM element will get the focus. The default implementation
     * does not take any focus.
     *
     * @returns the activated widget if it was found
     */
    activateWidget(id: string): Widget | undefined {
        let widget = find(this.mainPanel.widgets(), w => w.id === id);
        if (widget) {
            this.mainPanel.activateWidget(widget);
            return widget;
        }
        widget = find(this.bottomPanel.widgets(), w => w.id === id);
        if (widget) {
            this.expandBottomPanel();
            this.bottomPanel.activateWidget(widget);
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
    }

    /**
     * Reveal a widget in the application shell. This makes the widget visible,
     * but does not activate it.
     *
     * @returns the revealed widget if it was found
     */
    revealWidget(id: string): Widget | undefined {
        let widget = find(this.mainPanel.widgets(), w => w.id === id);
        if (!widget) {
            widget = find(this.bottomPanel.widgets(), w => w.id === id);
            if (widget) {
                this.expandBottomPanel();
            }
        }
        if (widget) {
            const tabBar = this.getTabBarFor(widget);
            if (tabBar) {
                tabBar.currentTitle = widget.title;
            }
            return widget;
        }
        widget = this.leftPanelHandler.expand(id);
        if (widget) {
            return widget;
        }
        widget = this.rightPanelHandler.expand(id);
        if (widget) {
            return widget;
        }
    }

    /**
     * Expand the named side panel area. This makes sure that the panel is visible, even if there
     * are no widgets in it. If the panel is already visible, nothing happens. If the panel is currently
     * collapsed (see `collapsePanel`) and it contains widgets, the widgets are revealed that were
     * visible before it was collapsed.
     */
    expandPanel(area: ApplicationShell.Area): void {
        switch (area) {
            case 'bottom':
                this.expandBottomPanel();
                break;
            case 'left':
                this.leftPanelHandler.expand();
                break;
            case 'right':
                this.rightPanelHandler.expand();
                break;
            default:
                throw new Error('Area cannot be expanded: ' + area);
        }
    }

    /**
     * Expand the bottom panel. See `expandPanel` regarding the exact behavior.
     */
    protected expandBottomPanel(): void {
        if (this.bottomPanel.isHidden) {
            this.bottomPanel.show();
            if (this.lastBottomPanelSize) {
                this.setBottomPanelSize(this.lastBottomPanelSize);
            }
        }
    }

    /**
     * Collapse the named side panel area. This makes sure that the panel is hidden,
     * increasing the space that is available for other shell areas.
     */
    collapsePanel(area: ApplicationShell.Area): void {
        switch (area) {
            case 'bottom':
                this.collapseBottomPanel();
                break;
            case 'left':
                this.leftPanelHandler.collapse();
                break;
            case 'right':
                this.rightPanelHandler.collapse();
                break;
            default:
                throw new Error('Area cannot be collapsed: ' + area);
        }
    }

    /**
     * Collapse the bottom panel. All contained widgets are hidden, but not closed.
     * They can be restored by calling `expandBottomPanel`.
     */
    protected collapseBottomPanel(): void {
        if (!this.bottomPanel.isHidden) {
            const size = this.getBottomPanelSize();
            if (size) {
                this.lastBottomPanelSize = size;
            }
            this.bottomPanel.hide();
        }
    }

    /**
     * Check whether the named side panel area is expanded (returns `true`) or collapsed (returns `false`).
     */
    isExpanded(area: ApplicationShell.Area): boolean {
        switch (area) {
            case 'bottom':
                return this.bottomPanel.isVisible;
            case 'left':
                return this.leftPanelHandler.tabBar.currentTitle !== null;
            case 'right':
                return this.rightPanelHandler.tabBar.currentTitle !== null;
            default:
                return true;
        }
    }

    /**
     * Close all tabs or a selection of tabs in a specific part of the application shell.
     *
     * @param tabBarOrArea
     *      Either the name of a shell area or a `TabBar` that is contained in such an area.
     * @param filter
     *      If undefined, all tabs are closed; otherwise only those tabs that match the filter are closed.
     */
    closeTabs(tabBarOrArea: TabBar<Widget> | ApplicationShell.Area,
        filter?: (title: Title<Widget>, index: number) => boolean): void {
        if (tabBarOrArea === 'main') {
            this.mainAreaTabBars.forEach(tb => this.closeTabs(tb, filter));
        } else if (tabBarOrArea === 'bottom') {
            this.bottomAreaTabBars.forEach(tb => this.closeTabs(tb, filter));
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
     * The shell area name of the currently active tab, or undefined.
     */
    get currentTabArea(): ApplicationShell.Area | undefined {
        const currentWidget = this.currentWidget;
        if (currentWidget) {
            return this.getAreaFor(currentWidget);
        }
    }

    /**
     * Determine the name of the shell area where the given widget resides. The result is
     * undefined if the widget does not reside directly in the shell.
     */
    getAreaFor(widget: Widget): ApplicationShell.Area | undefined {
        const title = widget.title;
        const mainPanelTabBar = find(this.mainPanel.tabBars(), bar => ArrayExt.firstIndexOf(bar.titles, title) > -1);
        if (mainPanelTabBar) {
            return 'main';
        }
        const bottomPanelTabBar = find(this.bottomPanel.tabBars(), bar => ArrayExt.firstIndexOf(bar.titles, title) > -1);
        if (bottomPanelTabBar) {
            return 'bottom';
        }
        if (ArrayExt.firstIndexOf(this.leftPanelHandler.tabBar.titles, title) > -1) {
            return 'left';
        }
        if (ArrayExt.firstIndexOf(this.rightPanelHandler.tabBar.titles, title) > -1) {
            return 'right';
        }
    }

    /**
     * Return the tab bar that has the currently active widget, or undefined.
     */
    get currentTabBar(): TabBar<Widget> | undefined {
        const currentWidget = this.currentWidget;
        if (currentWidget) {
            return this.getTabBarFor(currentWidget);
        }
    }

    /**
     * Return the tab bar in the given shell area, or the tab bar that has the given widget, or undefined.
     */
    getTabBarFor(widgetOrArea: Widget | ApplicationShell.Area): TabBar<Widget> | undefined {
        if (typeof widgetOrArea === 'string') {
            switch (widgetOrArea) {
                case 'main':
                    return this.mainPanel.tabBars().next();
                case 'bottom':
                    return this.bottomPanel.tabBars().next();
                case 'left':
                    return this.leftPanelHandler.tabBar;
                case 'right':
                    return this.rightPanelHandler.tabBar;
                default:
                    throw new Error('Illegal argument: ' + widgetOrArea);
            }
        } else if (widgetOrArea && widgetOrArea.isAttached) {
            const widgetTitle = widgetOrArea.title;
            const mainPanelTabBar = find(this.mainPanel.tabBars(), bar => ArrayExt.firstIndexOf(bar.titles, widgetTitle) > -1);
            if (mainPanelTabBar) {
                return mainPanelTabBar;
            }
            const bottomPanelTabBar = find(this.bottomPanel.tabBars(), bar => ArrayExt.firstIndexOf(bar.titles, widgetTitle) > -1);
            if (bottomPanelTabBar) {
                return bottomPanelTabBar;
            }
            const leftPanelTabBar = this.leftPanelHandler.tabBar;
            if (ArrayExt.firstIndexOf(leftPanelTabBar.titles, widgetTitle) > -1) {
                return leftPanelTabBar;
            }
            const rightPanelTabBar = this.rightPanelHandler.tabBar;
            if (ArrayExt.firstIndexOf(rightPanelTabBar.titles, widgetTitle) > -1) {
                return rightPanelTabBar;
            }
        }
    }

    /**
     * The tab bars contained in the main shell area. If there is no widget in the main area, the
     * returned array is empty.
     */
    get mainAreaTabBars(): TabBar<Widget>[] {
        return toArray(this.mainPanel.tabBars());
    }

    /**
     * The tab bars contained in the bottom shell area. If there is no widget in the bottom area,
     * the returned array is empty.
     */
    get bottomAreaTabBars(): TabBar<Widget>[] {
        return toArray(this.bottomPanel.tabBars());
    }

    /*
     * Activate the next tab in the current tab bar.
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
     * Return the tab bar next to the given tab bar; return the given tab bar if there is no adjacent one.
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
     * Activate the previous tab in the current tab bar.
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
     * Return the tab bar previous to the given tab bar; return the given tab bar if there is no adjacent one.
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

    /**
     * The _side areas_ are those shell areas that can be collapsed and expanded,
     * i.e. `left`, `right`, and `bottom`.
     */
    export function isSideArea(area?: Area): area is 'left' | 'right' | 'bottom' {
        return area === 'left' || area === 'right' || area === 'bottom';
    }

    /**
     * General options for the application shell. These are passed on construction and can be modified
     * through dependency injection (`ApplicationShellOptions` symbol).
     */
    export interface Options extends Widget.IOptions {
        /**
         * When a widget is being dragged and the distance of the mouse cursor to the shell border
         * is below this threshold, the respective side panel is expanded so the widget can be dropped
         * into that panel.
         */
        sidePanelExpandThreshold: number;
        /**
         * The maximum ratio of the shell height that can be occupied by the bottom panel. This value
         * does not limit how much the bottom panel can be manually resized, but it is considered when
         * the size of that panel is restored, e.g. when expanding the panel or reloading the page layout.
         */
        maxBottomPanelRatio: number;
        /**
         * The maximum ratio of the shell width that can be occupied by the left side panel. This value
         * does not limit how much the panel can be manually resized, but it is considered when
         * the size of that panel is restored, e.g. when expanding the panel or reloading the page layout.
         */
        maxLeftPanelRatio: number;
        /**
         * The maximum ratio of the shell width that can be occupied by the right side panel. This value
         * does not limit how much the panel can be manually resized, but it is considered when
         * the size of that panel is restored, e.g. when expanding the panel or reloading the page layout.
         */
        maxRightPanelRatio: number;
    }

    /**
     * Options for adding a widget to the application shell.
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
        mainPanel?: DockPanel.ILayoutConfig;
        bottomPanel?: BottomPanelLayoutData;
        leftPanel?: SidePanel.LayoutData;
        rightPanel?: SidePanel.LayoutData;
        statusBar?: StatusBarLayoutData;
    }

    /**
     * Data to save and load the bottom panel layout.
     */
    export interface BottomPanelLayoutData {
        config?: DockPanel.ILayoutConfig;
        size?: number;
        expanded?: boolean;
    }
}
