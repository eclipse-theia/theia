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

import PerfectScrollbar from 'perfect-scrollbar';
import { TabBar, Title, Widget } from '@phosphor/widgets';
import { VirtualElement, h, VirtualDOM, ElementInlineStyle } from '@phosphor/virtualdom';
import { MenuPath } from '../../common';
import { ContextMenuRenderer } from '../context-menu-renderer';
import { Signal } from '@phosphor/signaling';
import { Message } from '@phosphor/messaging';
import { ArrayExt } from '@phosphor/algorithm';
import { ElementExt } from '@phosphor/domutils';
import { TabBarToolbarRegistry, TabBarToolbar } from './tab-bar-toolbar';

/** The class name added to hidden content nodes, which are required to render vertical side bars. */
const HIDDEN_CONTENT_CLASS = 'theia-TabBar-hidden-content';

/** Menu path for tab bars used throughout the application shell. */
export const SHELL_TABBAR_CONTEXT_MENU: MenuPath = ['shell-tabbar-context-menu'];

export const TabBarRendererFactory = Symbol('TabBarRendererFactory');

/**
 * Size information of DOM elements used for rendering tabs in side bars.
 */
export interface SizeData {
    width: number;
    height: number;
}

/**
 * Extension of the rendering data used for tabs in side bars of the application shell.
 */
export interface SideBarRenderData extends TabBar.IRenderData<Widget> {
    labelSize?: SizeData;
    iconSize?: SizeData;
    paddingTop?: number;
    paddingBottom?: number;
}

/**
 * A tab bar renderer that offers a context menu. In addition, this renderer is able to
 * set an explicit position and size on the icon and label of each tab in a side bar.
 * This is necessary because the elements of side bar tabs are rotated using the CSS
 * `transform` property, disrupting the browser's ability to arrange those elements
 * automatically.
 */
export class TabBarRenderer extends TabBar.Renderer {

    /**
     * A reference to the tab bar is required in order to activate it when a context menu
     * is requested.
     */
    tabBar?: TabBar<Widget>;
    /**
     * The menu path used to render the context menu.
     */
    contextMenuPath?: MenuPath;

    constructor(protected readonly contextMenuRenderer?: ContextMenuRenderer) {
        super();
    }

    /**
     * Render tabs with the default DOM structure, but additionally register a context
     * menu listener.
     */
    renderTab(data: SideBarRenderData): VirtualElement {
        const title = data.title;
        const key = this.createTabKey(data);
        const style = this.createTabStyle(data);
        const className = this.createTabClass(data);
        const dataset = this.createTabDataset(data);
        return h.li(
            {
                key, className, title: title.caption, style, dataset,
                oncontextmenu: event => this.handleContextMenuEvent(event, title)
            },
            this.renderIcon(data),
            this.renderLabel(data),
            this.renderCloseIcon(data)
        );
    }

    /**
     * If size information is available for the label and icon, set an explicit height on the tab.
     * The height value also considers padding, which should be derived from CSS settings.
     */
    createTabStyle(data: SideBarRenderData): ElementInlineStyle {
        const zIndex = `${data.zIndex}`;
        const labelSize = data.labelSize;
        const iconSize = data.iconSize;
        let height: string | undefined;
        if (labelSize || iconSize) {
            const labelHeight = labelSize ? (this.tabBar && this.tabBar.orientation === 'horizontal' ? labelSize.height : labelSize.width) : 0;
            const iconHeight = iconSize ? iconSize.height : 0;
            let paddingTop = data.paddingTop || 0;
            if (labelHeight > 0 && iconHeight > 0) {
                // Leave some extra space between icon and label
                paddingTop = paddingTop * 1.5;
            }
            const paddingBottom = data.paddingBottom || 0;
            height = `${labelHeight + iconHeight + paddingTop + paddingBottom}px`;
        }
        return { zIndex, height };
    }

    /**
     * If size information is available for the label, set it as inline style. Tab padding
     * and icon size are also considered in the `top` position.
     */
    renderLabel(data: SideBarRenderData): VirtualElement {
        const labelSize = data.labelSize;
        const iconSize = data.iconSize;
        let width: string | undefined;
        let height: string | undefined;
        let top: string | undefined;
        if (labelSize) {
            width = `${labelSize.width}px`;
            height = `${labelSize.height}px`;
        }
        if (data.paddingTop || iconSize) {
            const iconHeight = iconSize ? iconSize.height : 0;
            let paddingTop = data.paddingTop || 0;
            if (iconHeight > 0) {
                // Leave some extra space between icon and label
                paddingTop = paddingTop * 1.5;
            }
            top = `${paddingTop + iconHeight}px`;
        }
        const style: ElementInlineStyle = { width, height, top };
        return h.div({ className: 'p-TabBar-tabLabel', style }, data.title.label);
    }

    /**
     * If size information is available for the icon, set it as inline style. Tab padding
     * is also considered in the `top` position.
     */
    renderIcon(data: SideBarRenderData): VirtualElement {
        let top: string | undefined;
        if (data.paddingTop) {
            top = `${data.paddingTop || 0}px`;
        }
        const className = this.createIconClass(data);
        const style: ElementInlineStyle = { top };
        return h.div({ className, style }, data.title.iconLabel);
    }

    protected handleContextMenuEvent(event: MouseEvent, title: Title<Widget>) {
        if (this.contextMenuRenderer && this.contextMenuPath) {
            event.stopPropagation();
            event.preventDefault();

            if (this.tabBar !== undefined) {
                this.tabBar.currentTitle = title;
                this.tabBar.activate();
                if (title.owner !== null) {
                    title.owner.activate();
                }
            }

            this.contextMenuRenderer.render(this.contextMenuPath, event);
        }
    }
}

/**
 * A specialized tab bar for the main and bottom areas.
 */
export class ScrollableTabBar extends TabBar<Widget> {

    protected scrollBar?: PerfectScrollbar;

    private scrollBarFactory: () => PerfectScrollbar;
    private pendingReveal?: Promise<void>;

    constructor(options?: TabBar.IOptions<Widget> & PerfectScrollbar.Options) {
        super(options);
        this.scrollBarFactory = () => new PerfectScrollbar(this.scrollbarHost, options);
    }

    protected onAfterAttach(msg: Message): void {
        if (!this.scrollBar) {
            this.scrollBar = this.scrollBarFactory();
        }
        super.onAfterAttach(msg);
    }

    protected onBeforeDetach(msg: Message): void {
        super.onBeforeDetach(msg);
        if (this.scrollBar) {
            this.scrollBar.destroy();
            this.scrollBar = undefined;
        }
    }

    protected onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        if (this.scrollBar) {
            this.scrollBar.update();
        }
    }

    protected onResize(msg: Widget.ResizeMessage): void {
        super.onResize(msg);
        if (this.scrollBar) {
            if (this.currentIndex >= 0) {
                this.revealTab(this.currentIndex);
            }
            this.scrollBar.update();
        }
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
                    const parent = this.scrollbarHost;
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

    protected get scrollbarHost(): HTMLElement {
        return this.node;
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
 * +-------------Scrollable--+-None-Scrollable-+
 *
 */
export class ToolbarAwareTabBar extends ScrollableTabBar {

    protected contentContainer: HTMLElement | undefined;
    protected toolbar: TabBarToolbar | undefined;

    constructor(
        protected readonly tabBarToolbarRegistry: TabBarToolbarRegistry,
        protected readonly tabBarToolbarFactory: () => TabBarToolbar,
        protected readonly options?: TabBar.IOptions<Widget> & PerfectScrollbar.Options) {

        super(options);
        this.rewireDOM();
        this.tabBarToolbarRegistry.onDidChange(() => this.update());
    }

    /**
     * Overrides the `contentNode` property getter in PhosphorJS' TabBar.
     */
    get contentNode(): HTMLUListElement {
        return this.tabBarContainer.getElementsByClassName(ToolbarAwareTabBar.Styles.TAB_BAR_CONTENT)[0] as HTMLUListElement;
    }

    /**
     * Overrides the scrollable host from the parent class.
     */
    protected get scrollbarHost(): HTMLElement {
        return this.tabBarContainer;
    }

    protected get tabBarContainer(): HTMLElement {
        return this.node.getElementsByClassName(ToolbarAwareTabBar.Styles.TAB_BAR_CONTENT_CONTAINER)[0] as HTMLElement;
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
        if (this.contentContainer) {
            this.node.removeChild(this.contentContainer);
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
        const current = this.currentTitle;
        const widget = current && current.owner || undefined;
        const items = widget ? this.tabBarToolbarRegistry.visibleItems(widget) : [];
        this.toolbar.updateItems(items, widget);
    }

    /**
     * Restructures the DOM defined in PhosphorJS.
     *
     * By default the tabs (`li`) are contained in the `this.contentNode` (`lu`) which is wrapped in a `div` (`this.node`).
     * Instead of this structure, we add a container for the `this.contentNode` and for the toolbar.
     * The scrollbar will only work for the `ul` part but it does not affect the toolbar, so it can be on the right hand-side.
     */
    protected rewireDOM(): void {
        const contentNode = this.node.getElementsByClassName(ToolbarAwareTabBar.Styles.TAB_BAR_CONTENT)[0];
        if (!contentNode) {
            throw new Error("'this.node' does not have the content as a direct children with class name 'p-TabBar-content'.");
        }
        this.node.removeChild(contentNode);
        this.contentContainer = document.createElement('div');
        this.contentContainer.classList.add(ToolbarAwareTabBar.Styles.TAB_BAR_CONTENT_CONTAINER);
        this.contentContainer.appendChild(contentNode);
        this.node.appendChild(this.contentContainer);
        this.toolbar = this.tabBarToolbarFactory();
    }

}

export namespace ToolbarAwareTabBar {

    export namespace Styles {

        export const TAB_BAR_CONTENT = 'p-TabBar-content';
        export const TAB_BAR_CONTENT_CONTAINER = 'p-TabBar-content-container';

    }

}

/**
 * A specialized tab bar for side areas.
 */
export class SideTabBar extends ScrollableTabBar {

    private static readonly DRAG_THRESHOLD = 5;

    /**
     * Emitted when a tab is added to the tab bar.
     */
    readonly tabAdded = new Signal<this, { title: Title<Widget> }>(this);
    /**
     * Side panels can be collapsed by clicking on the currently selected tab. This signal is
     * emitted when the mouse is released on the selected tab without initiating a drag.
     */
    readonly collapseRequested = new Signal<this, Title<Widget>>(this);

    private mouseData?: {
        pressX: number,
        pressY: number,
        mouseDownTabIndex: number
    };

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

    insertTab(index: number, value: Title<Widget> | Title.IOptions<Widget>): Title<Widget> {
        const result = super.insertTab(index, value);
        this.tabAdded.emit({ title: result });
        return result;
    }

    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.renderTabBar();
    }

    protected onUpdateRequest(msg: Message): void {
        this.renderTabBar();
        if (this.scrollBar) {
            this.scrollBar.update();
        }
    }

    /**
     * Render the tab bar in the _hidden content node_ (see `hiddenContentNode` for explanation),
     * then gather size information for labels and render it again in the proper content node.
     */
    protected renderTabBar(): void {
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
                    // Extract tab padding from the computed style
                    const tabStyle = window.getComputedStyle(hiddenTab);
                    const rd: Partial<SideBarRenderData> = {
                        paddingTop: parseFloat(tabStyle.paddingTop!),
                        paddingBottom: parseFloat(tabStyle.paddingBottom!)
                    };
                    // Extract label size from the DOM
                    const labelElements = hiddenTab.getElementsByClassName('p-TabBar-tabLabel');
                    if (labelElements.length === 1) {
                        const label = labelElements[0];
                        rd.labelSize = { width: label.clientWidth, height: label.clientHeight };
                    }
                    // Extract icon size from the DOM
                    const iconElements = hiddenTab.getElementsByClassName('p-TabBar-tabIcon');
                    if (iconElements.length === 1) {
                        const icon = iconElements[0];
                        rd.iconSize = { width: icon.clientWidth, height: icon.clientHeight };
                    }
                    renderData[i] = rd;
                }
                // Render into the visible node
                this.renderTabs(this.contentNode, renderData);
            });
        }
    }

    /**
     * Render the tab bar using the given DOM element as host. The optional `renderData` is forwarded
     * to the TabBarRenderer.
     */
    protected renderTabs(host: HTMLElement, renderData?: Partial<SideBarRenderData>[]): void {
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
            content[i] = renderer.renderTab(rd);
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
    handleEvent(event: Event): void {
        switch (event.type) {
            case 'mousedown':
                this.onMouseDown(event as MouseEvent);
                super.handleEvent(event);
                break;
            case 'mouseup':
                super.handleEvent(event);
                this.onMouseUp(event as MouseEvent);
                break;
            case 'mousemove':
                this.onMouseMove(event as MouseEvent);
                super.handleEvent(event);
                break;
            default:
                super.handleEvent(event);
        }
    }

    private onMouseDown(event: MouseEvent): void {
        // Check for left mouse button and current mouse status
        if (event.button !== 0 || this.mouseData) {
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

    private onMouseUp(event: MouseEvent): void {
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

    private onMouseMove(event: MouseEvent): void {
        // Check for left mouse button and current mouse status
        if (event.button !== 0 || !this.mouseData) {
            return;
        }

        const data = this.mouseData;
        const dx = Math.abs(event.clientX - data.pressX);
        const dy = Math.abs(event.clientY - data.pressY);
        const threshold = SideTabBar.DRAG_THRESHOLD;
        if (dx >= threshold || dy >= threshold) {
            this.mouseData = undefined;
        }
    }

}
