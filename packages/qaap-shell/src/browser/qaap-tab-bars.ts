// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import PerfectScrollbar from 'perfect-scrollbar';
import { TabBar, Title, Widget } from '@lumino/widgets';
import { VirtualDOM, VirtualElement } from '@lumino/virtualdom';
import { Message } from '@lumino/messaging';
import { ArrayExt } from '@lumino/algorithm';
import { ElementExt } from '@lumino/domutils';
import { Signal } from '@lumino/signaling';
import { Drag } from '@lumino/dragdrop';
import { Disposable, DisposableCollection } from '@theia/core/lib/common';
import { MOBILE_NARROW_VIEWPORT_MEDIA_QUERY } from '@theia/core/lib/browser/shell/mobile-layout-state';
import {
    TabBarRenderer,
    ScrollableRenderData,
    SideBarRenderData,
    SideTabBar
} from '@theia/core/lib/browser/shell/tab-bars';
import { TabBarToolbarRegistry, TabBarToolbar } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { TheiaDockPanel } from '@theia/core/lib/browser/shell/theia-dock-panel';
import { BreadcrumbsRenderer, BreadcrumbsRendererFactory } from '@theia/core/lib/browser/breadcrumbs/breadcrumbs-renderer';
import { Root, createRoot } from 'react-dom/client';
import { SelectComponent } from '@theia/core/lib/browser/widgets/select-component';
import { createElement } from 'react';
import { isContextMenuEvent } from '@theia/core/lib/browser/browser';
import { NavigatableWidget } from '@theia/core/lib/browser/navigatable-types';

/** Same as core `tab-bars.ts` (not exported upstream). */
const HIDDEN_CONTENT_CLASS = 'theia-TabBar-hidden-content';
export interface TabBarPrivateMethods {
    _releaseMouse(): void;
}

/**
 * A specialized tab bar for the main and bottom areas.
 */
export class QaapScrollableTabBar extends TabBar<Widget> {

    /**
     * When set on {@link contentContainer}, CSS applies native `overflow-x: auto` without requiring
     * PerfectScrollbar's `.ps` class (PS is omitted on narrow viewports — see {@link syncPerfectScrollbarWithViewport}).
     */
    static readonly NATIVE_SCROLL_X_CLASS = 'theia-tabbar-native-scroll-x';

    protected scrollBar: PerfectScrollbar | undefined;

    /** Matches `mobile-workbench.css` breakpoint; horizontal tabs use native overflow (like the bottom nav). */
    protected readonly narrowViewportMq: MediaQueryList | undefined =
        typeof window !== 'undefined' ? window.matchMedia(MOBILE_NARROW_VIEWPORT_MEDIA_QUERY) : undefined;

    protected readonly handleNarrowViewportMqChange = (): void => {
        this.syncPerfectScrollbarWithViewport();
    };

    protected pendingReveal?: Promise<void>;
    protected isMouseOver = false;
    protected needsRecompute = false;
    protected tabSize = 0;
    protected _dynamicTabOptions?: QaapScrollableTabBar.Options;
    protected contentContainer: HTMLElement;
    protected topRow: HTMLElement;

    protected readonly toDispose = new DisposableCollection();
    protected openTabsContainer: HTMLDivElement;
    protected openTabsRoot: Root;

    constructor(options?: TabBar.IOptions<Widget>, protected readonly scrollbarOptions?: PerfectScrollbar.Options, dynamicTabOptions?: QaapScrollableTabBar.Options) {
        super(options);
        this._dynamicTabOptions = dynamicTabOptions;
        this.topRow = document.createElement('div');
        this.topRow.classList.add('theia-tabBar-tab-row');
        this.node.appendChild(this.topRow);

        const contentNode = this.contentNode;
        if (!contentNode) {
            throw new Error('tab bar does not have the content node.');
        }
        this.node.removeChild(contentNode);
        this.contentContainer = document.createElement('div');
        this.contentContainer.classList.add(QaapScrollableTabBar.Styles.TAB_BAR_CONTENT_CONTAINER);
        this.contentContainer.appendChild(contentNode);
        this.topRow.appendChild(this.contentContainer);

        this.openTabsContainer = document.createElement('div');
        this.openTabsContainer.classList.add('theia-tabBar-open-tabs');
        this.openTabsRoot = createRoot(this.openTabsContainer);
        this.topRow.appendChild(this.openTabsContainer);

        if (this.narrowViewportMq) {
            this.narrowViewportMq.addEventListener('change', this.handleNarrowViewportMqChange);
            this.toDispose.push(Disposable.create(() => {
                this.narrowViewportMq?.removeEventListener('change', this.handleNarrowViewportMqChange);
            }));
        }
    }

    set dynamicTabOptions(options: QaapScrollableTabBar.Options | undefined) {
        this._dynamicTabOptions = options;
        this.updateTabs();
    }

    get dynamicTabOptions(): QaapScrollableTabBar.Options | undefined {
        return this._dynamicTabOptions;
    }

    override dispose(): void {
        if (this.isDisposed) {
            return;
        }
        super.dispose();
        this.toDispose.dispose();
    }

    protected override onBeforeAttach(msg: Message): void {
        this.contentNode.addEventListener('pointerdown', this);
        this.contentNode.addEventListener('dblclick', this);
        this.contentNode.addEventListener('keydown', this);
    }

    protected override onAfterDetach(msg: Message): void {
        this.contentNode.removeEventListener('pointerdown', this);
        this.contentNode.removeEventListener('dblclick', this);
        this.contentNode.removeEventListener('keydown', this);
        this.doReleaseMouse();
    }

    protected doReleaseMouse(): void {
        (this as unknown as TabBarPrivateMethods)._releaseMouse();
    }

    protected override onAfterAttach(msg: Message): void {
        this.node.addEventListener('mouseenter', () => { this.isMouseOver = true; });
        this.node.addEventListener('mouseleave', () => {
            this.isMouseOver = false;
            if (this.needsRecompute) {
                this.updateTabs();
            }
        });

        super.onAfterAttach(msg);
        this.syncPerfectScrollbarWithViewport();
    }

    /**
     * On narrow widths, skip PerfectScrollbar for horizontal strips so the browser owns touch pan
     * and momentum (same as `#theia-mobile-bottom-bar`). PS `updateGeometry` can reset `scrollLeft`
     * when it mis-detects overflow under flex layout.
     */
    protected syncPerfectScrollbarWithViewport(): void {
        const useNativeHorizontal = this.orientation === 'horizontal' && !!this.narrowViewportMq?.matches;
        if (useNativeHorizontal) {
            if (this.scrollBar) {
                this.scrollBar.destroy();
                this.scrollBar = undefined;
            }
            this.contentContainer.classList.add(QaapScrollableTabBar.NATIVE_SCROLL_X_CLASS);
        } else {
            this.contentContainer.classList.remove(QaapScrollableTabBar.NATIVE_SCROLL_X_CLASS);
            if (!this.scrollBar && this.isAttached) {
                this.scrollBar = new PerfectScrollbar(this.contentContainer, this.scrollbarOptions);
            }
            this.scrollBar?.update();
        }
        if (this.currentIndex >= 0) {
            void this.revealTab(this.currentIndex);
        }
    }

    protected override onBeforeDetach(msg: Message): void {
        this.scrollBar?.destroy();
        this.scrollBar = undefined;
        super.onBeforeDetach(msg);
    }

    protected override onUpdateRequest(msg: Message): void {
        this.updateTabs();
    }

    protected updateTabs(): void {
        const content = [];
        if (this.dynamicTabOptions) {

            this.openTabsRoot.render(createElement(SelectComponent, {
                options: this.titles,
                onChange: (_option: unknown, index: number) => {
                    this.currentIndex = index;
                },
                alignment: 'right'
            }));

            if (this.isMouseOver) {
                this.needsRecompute = true;
            } else {
                this.needsRecompute = false;
                if (this.orientation === 'horizontal') {
                    let availableWidth = this.contentNode.clientWidth;
                    let effectiveWidth = availableWidth;
                    if (!this.openTabsContainer.classList.contains('lm-mod-hidden')) {
                        availableWidth += this.openTabsContainer.getBoundingClientRect().width;
                    }
                    if (this.dynamicTabOptions.minimumTabSize * this.titles.length <= availableWidth) {
                        effectiveWidth += this.openTabsContainer.getBoundingClientRect().width;
                        this.openTabsContainer.classList.add('lm-mod-hidden');
                    } else {
                        this.openTabsContainer.classList.remove('lm-mod-hidden');
                    }
                    this.tabSize = Math.max(Math.min(effectiveWidth / this.titles.length,
                        this.dynamicTabOptions.defaultTabSize), this.dynamicTabOptions.minimumTabSize);
                }
            }
            this.node.classList.add('dynamic-tabs');
        } else {
            this.openTabsContainer.classList.add('lm-mod-hidden');
            this.node.classList.remove('dynamic-tabs');
        }
        for (let i = 0, n = this.titles.length; i < n; ++i) {
            const title = this.titles[i];
            const current = title === this.currentTitle;
            const zIndex = current ? n : n - i - 1;
            const renderData: ScrollableRenderData = { title: title, current: current, zIndex: zIndex };
            if (this.dynamicTabOptions && this.orientation === 'horizontal') {
                renderData.tabWidth = this.tabSize;
            }
            content[i] = this.renderer.renderTab(renderData);
        }
        VirtualDOM.render(content, this.contentNode);
        if (this.scrollBar) {
            if (!(this.dynamicTabOptions && this.isMouseOver)) {
                this.scrollBar.update();
            }
        }
    }

    protected override onResize(msg: Widget.ResizeMessage): void {
        super.onResize(msg);
        if (this.dynamicTabOptions) {
            this.updateTabs();
        }
        if (this.currentIndex >= 0) {
            void this.revealTab(this.currentIndex);
        }
        this.scrollBar?.update();
    }

    /**
     * Reveal the tab with the given index by moving the scroll bar if necessary.
     */
    revealTab(index: number): Promise<void> {
        if (this.pendingReveal) {
            // A reveal has already been scheduled
            return this.pendingReveal;
        }
        const result = new Promise<void>((resolve, reject) => {
            // The tab might not have been created yet, so wait until the next frame
            window.requestAnimationFrame(() => {
                const tab = this.contentNode.children[index] as HTMLElement;
                if (tab && this.isVisible) {
                    const parent = this.contentContainer;
                    if (this.orientation === 'horizontal') {
                        const scroll = parent.scrollLeft;
                        const left = tab.offsetLeft;
                        if (scroll > left) {
                            parent.scrollLeft = left;
                        } else {
                            const right = left + tab.clientWidth - parent.clientWidth;
                            if (scroll < right && tab.clientWidth < parent.clientWidth) {
                                parent.scrollLeft = right;
                            }
                        }
                    } else {
                        const scroll = parent.scrollTop;
                        const top = tab.offsetTop;
                        if (scroll > top) {
                            parent.scrollTop = top;
                        } else {
                            const bottom = top + tab.clientHeight - parent.clientHeight;
                            if (scroll < bottom && tab.clientHeight < parent.clientHeight) {
                                parent.scrollTop = bottom;
                            }
                        }
                    }
                }
                if (this.pendingReveal === result) {
                    this.pendingReveal = undefined;
                }
                resolve();
            });
        });
        this.pendingReveal = result;
        return result;
    }
}

export namespace QaapScrollableTabBar {

    export interface Options {
        minimumTabSize: number;
        defaultTabSize: number;
    }
    export namespace Styles {

        export const TAB_BAR_CONTENT_CONTAINER = 'lm-TabBar-content-container';

    }
}

/**
 * Specialized scrollable tab-bar which comes with toolbar support.
 * Instead of the following DOM structure.
 *
 * +-------------------------+
 * |[TAB_0][TAB_1][TAB_2][TAB|
 * +-------------Scrollable--+
 *
 * There is a dedicated HTML element for toolbar which does **not** contained in the scrollable element.
 *
 * +-------------------------+-----------------+
 * |[TAB_0][TAB_1][TAB_2][TAB|         Toolbar |
 * +-------------Scrollable--+-Non-Scrollable-+
 *
 */
export class QaapToolbarAwareTabBar extends QaapScrollableTabBar {
    protected toolbar: TabBarToolbar | undefined;
    protected breadcrumbsContainer: HTMLElement;
    protected readonly breadcrumbsRenderer: BreadcrumbsRenderer;
    protected dockPanel: TheiaDockPanel;

    constructor(
        protected readonly tabBarToolbarRegistry: TabBarToolbarRegistry,
        protected readonly tabBarToolbarFactory: () => TabBarToolbar,
        protected readonly breadcrumbsRendererFactory: BreadcrumbsRendererFactory,
        options?: TabBar.IOptions<Widget>,
        scrollbarOptions?: PerfectScrollbar.Options,
        dynamicTabOptions?: QaapScrollableTabBar.Options
    ) {
        super(options, scrollbarOptions, dynamicTabOptions);

        this.breadcrumbsRenderer = this.breadcrumbsRendererFactory();
        this.breadcrumbsContainer = document.createElement('div');
        this.breadcrumbsContainer.classList.add('theia-tabBar-breadcrumb-row');
        this.breadcrumbsContainer.appendChild(this.breadcrumbsRenderer.host);
        this.node.appendChild(this.breadcrumbsContainer);

        this.toolbar = this.tabBarToolbarFactory();
        this.toDispose.push(this.toolbar);
        this.toDispose.push(this.tabBarToolbarRegistry.onDidChange(() => this.update()));
        this.toDispose.push(this.breadcrumbsRenderer);

        if (!this.breadcrumbsRenderer.active) {
            this.breadcrumbsContainer.style.setProperty('display', 'none');
        } else {
            this.node.classList.add('theia-tabBar-multirow');
        }
        this.toDispose.push(this.breadcrumbsRenderer.onDidChangeActiveState(active => {
            if (active) {
                this.breadcrumbsContainer.style.removeProperty('display');
                this.node.classList.add('theia-tabBar-multirow');
            } else {
                this.breadcrumbsContainer.style.setProperty('display', 'none');
                this.node.classList.remove('theia-tabBar-multirow');
            }
            if (this.dockPanel) {
                this.dockPanel.fit();
            }
        }));
        const handler = () => this.updateBreadcrumbs();
        this.currentChanged.connect(handler);
        this.toDispose.push(Disposable.create(() => this.currentChanged.disconnect(handler)));
    }

    setDockPanel(panel: TheiaDockPanel): void {
        this.dockPanel = panel;
    }

    protected async updateBreadcrumbs(): Promise<void> {
        const current = this.currentTitle?.owner;
        const uri = NavigatableWidget.is(current) ? current.getResourceUri() : undefined;
        await this.breadcrumbsRenderer.refresh(uri);
    }

    protected override onAfterAttach(msg: Message): void {
        if (this.toolbar) {
            if (this.toolbar.isAttached) {
                Widget.detach(this.toolbar);
            }
            Widget.attach(this.toolbar, this.topRow);
            if (this.breadcrumbsContainer) {
                this.node.appendChild(this.breadcrumbsContainer);
            }
            this.updateBreadcrumbs();
        }
        super.onAfterAttach(msg);
    }

    protected override onBeforeDetach(msg: Message): void {
        if (this.toolbar && this.toolbar.isAttached) {
            Widget.detach(this.toolbar);
        }
        super.onBeforeDetach(msg);
    }

    protected override onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        this.updateToolbar();
    }

    protected updateToolbar(): void {
        if (!this.toolbar) {
            return;
        }
        const widget = this.currentTitle?.owner ?? undefined;
        this.toolbar.updateTarget(widget);
        this.updateTabs();
    }

    override handleEvent(event: Event): void {
        if (event instanceof MouseEvent) {
            if (isContextMenuEvent(event)) {
                // Let this bubble up to handle the context menu
                return;
            }
            if (this.toolbar && this.toolbar.shouldHandleMouseEvent(event) || this.isOver(event, this.openTabsContainer)) {
                // if the mouse event is over the toolbar part don't handle it.
                return;
            }
        }
        super.handleEvent(event);
    }

    protected isOver(event: Event, element: Element): boolean {
        return element && event.target instanceof Element && element.contains(event.target);
    }
}

/**
 * Qaap horizontal activity strip for side panels (extends core {@link SideTabBar}).
 */
export class QaapSideTabBar extends SideTabBar {

    protected static override readonly DRAG_THRESHOLD = 5;

    /**
     * Emitted when a tab is added to the tab bar.
     */
    override readonly tabAdded = new Signal<this, { title: Title<Widget> }>(this);
    /**
     * Side panels can be collapsed by clicking on the currently selected tab. This signal is
     * emitted when the mouse is released on the selected tab without initiating a drag.
     */
    override readonly collapseRequested = new Signal<this, Title<Widget>>(this);

    /**
     * Emitted when the set of overflowing/hidden tabs changes.
     */
    override readonly tabsOverflowChanged = new Signal<this, { titles: Title<Widget>[], startIndex: number }>(this);

    protected override mouseData?: {
        pressX: number,
        pressY: number,
        mouseDownTabIndex: number
    };

    protected override tabsOverflowData?: {
        titles: Title<Widget>[],
        startIndex: number
    };

    protected activityStripScrollInstalled = false;
    protected activityStripResizeObserver?: ResizeObserver;

    constructor(options?: TabBar.IOptions<Widget> & PerfectScrollbar.Options) {
        super(options);

        // Create the hidden content node (see `hiddenContentNode` for explanation)
        const hiddenContent = document.createElement('ul');
        hiddenContent.className = HIDDEN_CONTENT_CLASS;
        this.node.appendChild(hiddenContent);
    }

    /**
     * Tab bars of the left and right side panel are arranged vertically by rotating their labels.
     * Rotation is realized with the CSS `transform` property, which disrupts the browser's ability
     * to arrange the involved elements automatically. Therefore the elements are arranged explicitly
     * by the TabBarRenderer using inline `height` and `top` styles. However, the size of labels
     * must still be computed by the browser, so the rendering is performed in two steps: first the
     * tab bar is rendered horizontally inside a _hidden content node_, then it is rendered again
     * vertically inside the proper content node. After the first step, size information is gathered
     * from all labels so it can be applied during the second step.
     */
    get hiddenContentNode(): HTMLUListElement {
        return this.node.getElementsByClassName(HIDDEN_CONTENT_CLASS)[0] as HTMLUListElement;
    }

    override insertTab(index: number, value: Title<Widget> | Title.IOptions<Widget>): Title<Widget> {
        const result = super.insertTab(index, value);
        this.tabAdded.emit({ title: result });
        if (this.orientation === 'horizontal') {
            window.requestAnimationFrame(() => this.refreshActivityStripScrollState());
        }
        return result;
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.installActivityStripScroll();
        this.updateTabs();
        this.node.addEventListener('lm-dragenter', this);
        this.node.addEventListener('lm-dragover', this);
        this.node.addEventListener('lm-dragleave', this);
        document.addEventListener('lm-drop', this);
    }

    protected override onBeforeDetach(msg: Message): void {
        this.disposeActivityStripScroll();
        super.onBeforeDetach(msg);
    }

    protected override onAfterDetach(msg: Message): void {
        super.onAfterDetach(msg);
        this.node.removeEventListener('lm-dragenter', this);
        this.node.removeEventListener('lm-dragover', this);
        this.node.removeEventListener('lm-dragleave', this);
        document.removeEventListener('lm-drop', this);
    }

    protected installActivityStripScroll(): void {
        if (this.orientation !== 'horizontal' || this.activityStripScrollInstalled) {
            return;
        }
        this.activityStripScrollInstalled = true;
        this.contentContainer.classList.add(QaapScrollableTabBar.NATIVE_SCROLL_X_CLASS);
        this.observeActivityStripResize();
        this.refreshActivityStripScrollState();
    }

    protected observeActivityStripResize(): void {
        if (typeof ResizeObserver === 'undefined') {
            return;
        }
        this.activityStripResizeObserver?.disconnect();
        this.activityStripResizeObserver = new ResizeObserver(() => {
            this.refreshActivityStripScrollState();
        });
        this.activityStripResizeObserver.observe(this.contentContainer);
        this.activityStripResizeObserver.observe(this.topRow);
    }

    protected disposeActivityStripScroll(): void {
        if (!this.activityStripScrollInstalled) {
            return;
        }
        this.activityStripScrollInstalled = false;
        this.activityStripResizeObserver?.disconnect();
        this.activityStripResizeObserver = undefined;
    }

    protected refreshActivityStripScrollState(): void {
        const host = this.contentContainer;
        const overflow = host.scrollWidth > host.clientWidth + 1;
        host.classList.toggle('theia-activity-strip-scrollable', overflow);
        this.node.classList.toggle('theia-activity-strip-scrollable', overflow);
    }

    protected override onUpdateRequest(msg: Message): void {
        this.updateTabs();
    }

    protected override onResize(msg: Widget.ResizeMessage): void {
        // Tabs need to be updated if there are already overflowing tabs or the current tabs don't fit
        if (this.orientation === 'horizontal') {
            if (this.tabsOverflowData || this.contentContainer.clientWidth < this.contentNode.scrollWidth) {
                this.updateTabs();
            }
            this.refreshActivityStripScrollState();
            return;
        }
        if (this.tabsOverflowData || this.node.clientHeight < this.contentNode.clientHeight) {
            this.updateTabs();
        }
    }

    /**
     * Reveal the tab with the given index by moving it into the non-overflowing tabBar section
     * if necessary.
     */
    override revealTab(index: number): Promise<void> {
        if (this.orientation === 'horizontal') {
            return super.revealTab(index);
        }
        if (this.pendingReveal) {
            // A reveal has already been scheduled
            return this.pendingReveal;
        }
        const result = new Promise<void>(resolve => {
            // The tab might not have been created yet, so wait until the next frame
            window.requestAnimationFrame(() => {
                if (this.tabsOverflowData && index >= this.tabsOverflowData.startIndex) {
                    const title = this.titles[index];
                    this.insertTab(this.tabsOverflowData.startIndex - 1, title);
                }

                if (this.pendingReveal === result) {
                    this.pendingReveal = undefined;
                }
                resolve();
            });
        });
        this.pendingReveal = result;
        return result;
    }

    /**
     * Render the tab bar in the _hidden content node_ (see `hiddenContentNode` for explanation),
     * then gather size information for labels and render it again in the proper content node.
     */
    protected override updateTabs(): void {
        if (this.orientation === 'horizontal') {
            if (this.isAttached) {
                VirtualDOM.render([], this.hiddenContentNode);
                this.renderTabs(this.contentNode);
                this.scrollBar?.update();
                this.refreshActivityStripScrollState();
                window.requestAnimationFrame(() => this.computeOverflowingTabsData());
            }
            return;
        }
        if (this.isAttached) {
            // Render into the invisible node
            this.renderTabs(this.hiddenContentNode);
            // Await a rendering frame
            window.requestAnimationFrame(() => {
                const hiddenContent = this.hiddenContentNode;
                const n = hiddenContent.children.length;
                const renderData = new Array<Partial<SideBarRenderData>>(n);
                for (let i = 0; i < n; i++) {
                    const hiddenTab = hiddenContent.children[i];
                    // Extract tab padding, and margin from the computed style
                    const tabStyle = window.getComputedStyle(hiddenTab);
                    const rd: Partial<SideBarRenderData> = {
                        paddingTop: parseFloat(tabStyle.paddingTop!),
                        paddingBottom: parseFloat(tabStyle.paddingBottom!)
                    };
                    // Extract label size from the DOM
                    const labelElements = hiddenTab.getElementsByClassName('lm-TabBar-tabLabel');
                    if (labelElements.length === 1) {
                        const label = labelElements[0];
                        rd.labelSize = { width: label.clientWidth, height: label.clientHeight };
                    }
                    // Extract icon size from the DOM
                    const iconElements = hiddenTab.getElementsByClassName('lm-TabBar-tabIcon');
                    if (iconElements.length === 1) {
                        const icon = iconElements[0];
                        rd.iconSize = { width: icon.clientWidth, height: icon.clientHeight };
                    }

                    renderData[i] = rd;
                }
                // Render into the visible node
                this.renderTabs(this.contentNode, renderData);
                this.computeOverflowingTabsData();
            });
        }
    }

    protected override computeOverflowingTabsData(): void {
        // ensure that render tabs has completed
        window.requestAnimationFrame(() => {
            const startIndex = this.hideOverflowingTabs();
            if (startIndex === -1) {
                if (this.tabsOverflowData) {
                    this.tabsOverflowData = undefined;
                    this.tabsOverflowChanged.emit({ titles: [], startIndex });
                }
            } else {
                const newOverflowingTabs = this.titles.slice(startIndex);

                if (!this.tabsOverflowData) {
                    this.tabsOverflowData = { titles: newOverflowingTabs, startIndex };
                    this.tabsOverflowChanged.emit(this.tabsOverflowData);
                } else if ((newOverflowingTabs.length !== (this.tabsOverflowData?.titles.length ?? 0)) ||
                    newOverflowingTabs.find((newTitle, i) => newTitle !== this.tabsOverflowData?.titles[i]) !== undefined) {
                    this.tabsOverflowData = { titles: newOverflowingTabs, startIndex };
                    this.tabsOverflowChanged.emit(this.tabsOverflowData);
                }
            }
            this.scrollBar?.update();
            this.refreshActivityStripScrollState();
        });
    }

    /**
     * Hide overflowing tabs and return the index of the first hidden tab.
     */
    protected override hideOverflowingTabs(): number {
        const invisibleClass = 'lm-mod-invisible';
        let startIndex = -1;
        const n = this.contentNode.children.length;
        if (this.orientation === 'horizontal') {
            for (let i = 0; i < n; i++) {
                (this.contentNode.children[i] as HTMLLIElement).classList.remove(invisibleClass);
            }
            return -1;
        }
        const availableHeight = this.node.clientHeight;
        for (let i = 0; i < n; i++) {
            const tab = this.contentNode.children[i] as HTMLLIElement;
            if (tab.offsetTop + tab.offsetHeight >= availableHeight) {
                tab.classList.add(invisibleClass);
                if (startIndex === -1) {
                    startIndex = i;
                    /* If only one element is overflowing and the additional menu widget is visible (i.e. this.tabsOverflowData is set)
                     * there might already be enough space to show the last tab. In this case, we need to include the size of the
                     * additional menu widget and recheck if the last tab is visible */
                    if (startIndex === n - 1 && this.tabsOverflowData) {
                        const additionalViewsMenu = this.node.parentElement?.querySelector('.theia-additional-views-menu') as HTMLDivElement;
                        if (tab.offsetTop + tab.offsetHeight < availableHeight + additionalViewsMenu.offsetHeight) {
                            tab.classList.remove(invisibleClass);
                            startIndex = -1;
                        }
                    }
                }
            } else {
                tab.classList.remove(invisibleClass);
            }
        }
        return startIndex;
    }

    /**
     * Render the tab bar using the given DOM element as host. The optional `renderData` is forwarded
     * to the TabBarRenderer.
     */
    protected override renderTabs(host: HTMLElement, renderData?: Partial<SideBarRenderData>[]): void {
        const titles = this.titles;
        const n = titles.length;
        const renderer = this.renderer as TabBarRenderer;
        const currentTitle = this.currentTitle;
        const content = new Array<VirtualElement>(n);
        for (let i = 0; i < n; i++) {
            const title = titles[i];
            const current = title === currentTitle;
            const zIndex = current ? n : n - i - 1;
            let rd: SideBarRenderData;
            if (renderData && i < renderData.length) {
                rd = { title, current, zIndex, ...renderData[i] };
            } else {
                rd = { title, current, zIndex };
            }
            // Based on how renderTabs() is called, assume renderData will be undefined when invoked for this.hiddenContentNode
            content[i] = renderer.renderTab(rd, true, renderData === undefined);
        }
        VirtualDOM.render(content, host);
    }

    /**
     * The following event processing is used to generate `collapseRequested` signals
     * when the mouse goes up on the currently selected tab without too much movement
     * between `mousedown` and `mouseup`. The movement threshold is the same that
     * is used by the superclass to detect a drag event. The `allowDeselect` option
     * of the TabBar constructor cannot be used here because it is triggered when the
     * mouse goes down, and thus collides with dragging.
     */
    override handleEvent(event: Event): void {
        switch (event.type) {
            case 'pointerdown':
                if (!isContextMenuEvent(event as PointerEvent)) {
                    this.onMouseDown(event as PointerEvent);
                    super.handleEvent(event);
                }
                break;
            case 'pointerup':
                if (!isContextMenuEvent(event as PointerEvent)) {
                    super.handleEvent(event);
                    this.onMouseUp(event as PointerEvent);
                }
                break;
            case 'mousemove':
                if (!isContextMenuEvent(event as PointerEvent)) {
                    this.onMouseMove(event as PointerEvent);
                    super.handleEvent(event);
                }
                break;
            case 'lm-dragenter':
                this.onDragEnter(event as Drag.Event);
                break;
            case 'lm-dragover':
                this.onDragOver(event as Drag.Event);
                break;
            case 'lm-dragleave': case 'lm-drop':
                this.cancelViewContainerDND();
                break;
            case 'contextmenu':
                // Let the event bubble up instead of quashing it in the superclass
                break;
            default:
                super.handleEvent(event);
        }
    }

    protected override onMouseDown(event: MouseEvent): void {
        // Check for left mouse button and current mouse status
        if (event.button !== 0 || this.mouseData) {
            return;
        }
        // Horizontal activity strip: collapse only from the top bar toggle, not by re-clicking the active view tab.
        if (this.orientation === 'horizontal') {
            return;
        }

        // Check whether the mouse went down on the current tab
        const tabs = this.contentNode.children;
        const index = ArrayExt.findFirstIndex(tabs, tab => ElementExt.hitTest(tab, event.clientX, event.clientY));
        if (index < 0 || index !== this.currentIndex) {
            return;
        }

        // Check whether the close button was clicked
        const icon = tabs[index].querySelector(this.renderer.closeIconSelector);
        if (icon && icon.contains(event.target as HTMLElement)) {
            return;
        }

        this.mouseData = {
            pressX: event.clientX,
            pressY: event.clientY,
            mouseDownTabIndex: index
        };
    }

    protected override onMouseUp(event: MouseEvent): void {
        // Check for left mouse button and current mouse status
        if (event.button !== 0 || !this.mouseData) {
            return;
        }

        // Check whether the mouse went up on the current tab
        const mouseDownTabIndex = this.mouseData.mouseDownTabIndex;
        this.mouseData = undefined;
        const tabs = this.contentNode.children;
        const index = ArrayExt.findFirstIndex(tabs, tab => ElementExt.hitTest(tab, event.clientX, event.clientY));
        if (index < 0 || index !== mouseDownTabIndex) {
            return;
        }

        // Collapse the side bar
        this.collapseRequested.emit(this.titles[index]);
    }

    protected override onMouseMove(event: MouseEvent): void {
        // Check for left mouse button and current mouse status
        if (event.button !== 0 || !this.mouseData) {
            return;
        }

        const data = this.mouseData;
        const dx = Math.abs(event.clientX - data.pressX);
        const dy = Math.abs(event.clientY - data.pressY);
        const threshold = QaapSideTabBar.DRAG_THRESHOLD;
        if (dx >= threshold || dy >= threshold) {
            this.mouseData = undefined;
        }
    }

    toCancelViewContainerDND = new DisposableCollection();
    protected override cancelViewContainerDND = () => {
        this.toCancelViewContainerDND.dispose();
    };

    /**
     * Handles `viewContainerPart` drag enter.
     */
    protected override onDragEnter = (event: Drag.Event) => {
        this.cancelViewContainerDND();
        if (event.mimeData.getData('application/vnd.lumino.view-container-factory')) {
            event.preventDefault();
            event.stopPropagation();
        }
    };

    /**
     * Handle `viewContainerPart` drag over,
     * Defines the appropriate `dropAction` and opens the tab on which the mouse stands on for more than 800 ms.
     */
    protected override onDragOver = (event: Drag.Event) => {
        const factory = event.mimeData.getData('application/vnd.lumino.view-container-factory');
        const widget = factory && factory();
        if (!widget) {
            event.dropAction = 'none';
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (!this.toCancelViewContainerDND.disposed) {
            event.dropAction = event.proposedAction;
            return;
        }

        const { target, clientX, clientY } = event;
        if (target instanceof HTMLElement) {
            if (widget.options.disableDraggingToOtherContainers || widget.viewContainer.disableDNDBetweenContainers) {
                event.dropAction = 'none';
                target.classList.add('theia-cursor-no-drop');
                this.toCancelViewContainerDND.push(Disposable.create(() => {
                    target.classList.remove('theia-cursor-no-drop');
                }));
            } else {
                event.dropAction = event.proposedAction;
            }
            const { top, bottom, left, right, height } = target.getBoundingClientRect();
            const mouseOnTop = (clientY - top) < (height / 2);
            const dropTargetClass = `drop-target-${mouseOnTop ? 'top' : 'bottom'}`;
            const tabs = this.contentNode.children;
            const targetTab = ArrayExt.findFirstValue(tabs, t => ElementExt.hitTest(t, clientX, clientY));
            if (!targetTab) {
                return;
            }
            targetTab.classList.add(dropTargetClass);
            this.toCancelViewContainerDND.push(Disposable.create(() => {
                if (targetTab) {
                    targetTab.classList.remove(dropTargetClass);
                }
            }));
            const openTabTimer = setTimeout(() => {
                const title = this.titles.find(t => (this.renderer as TabBarRenderer).createTabId(t) === targetTab.id);
                if (title) {
                    const mouseStillOnTab = clientX >= left && clientX <= right && clientY >= top && clientY <= bottom;
                    if (mouseStillOnTab) {
                        this.currentTitle = title;
                    }
                }
            }, 800);
            this.toCancelViewContainerDND.push(Disposable.create(() => {
                clearTimeout(openTabTimer);
            }));
        }
    };

}
