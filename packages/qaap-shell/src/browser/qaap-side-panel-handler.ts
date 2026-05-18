// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { some, toArray } from '@lumino/algorithm';
import { Widget, Title, Panel, BoxPanel, BoxLayout, SplitPanel } from '@lumino/widgets';
import { MessageLoop } from '@lumino/messaging';
import {
    SidePanelHandler,
    SidePanel,
    LEFT_RIGHT_AREA_CLASS
} from '@theia/core/lib/browser/shell/side-panel-handler';
import { SHELL_TABBAR_CONTEXT_MENU, SideTabBar } from '@theia/core/lib/browser/shell/tab-bars';
import { SplitPositionOptions } from '@theia/core/lib/browser/shell/split-panels';
import { MOBILE_ONE_COLUMN_LAYOUT_CLASS } from '@theia/core/lib/browser/shell/mobile-layout-state';
import { QaapSideTabBar } from './qaap-tab-bars';
import { QaapActivityBarCloseButton } from './qaap-activity-bar-close-button';

const COLLAPSED_CLASS = 'theia-mod-collapsed';

/**
 * Qaap side panel: horizontal activity strip, left-panel collapse behavior, resize relayout.
 */
@injectable()
export class QaapSidePanelHandler extends SidePanelHandler {

    protected containerResizeObserver: ResizeObserver | undefined;
    protected resizeRelayoutFrame: number | undefined;
    protected lastObservedWidth = -1;
    protected lastObservedHeight = -1;

    protected activityScrollHost!: Panel;
    protected activityCloseButton!: QaapActivityBarCloseButton;

    override create(side: 'left' | 'right', options: SidePanel.Options): void {
        this.side = side;
        this.options = options;
        this.topMenu = this.createSidebarTopMenu();
        this.tabBar = this.createSideBar();
        this.additionalViewsMenu = this.createAdditionalViewsWidget();
        this.bottomMenu = this.createSidebarBottomMenu();
        this.toolBar = this.createToolbar();
        this.dockPanel = this.createSidePanel();
        this.container = this.createContainer();
        this.observeContainerResize();
        this.refresh();
    }

    protected override createSideBar(): SideTabBar {
        const side = this.side;
        const tabBarRenderer = this.tabBarRendererFactory();
        const sideBar = new QaapSideTabBar({
            orientation: 'horizontal',
            insertBehavior: 'none',
            removeBehavior: 'select-previous-tab',
            allowDeselect: false,
            tabsMovable: true,
            renderer: tabBarRenderer,
            handlers: ['drag-thumb', 'keyboard', 'wheel'],
            useBothWheelAxes: true,
            scrollXMarginOffset: 8,
            suppressScrollX: false,
            suppressScrollY: true,
            wheelSpeed: 1.45,
            wheelPropagation: false
        });
        tabBarRenderer.tabBar = sideBar;
        sideBar.disposed.connect(() => tabBarRenderer.dispose());
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
        sideBar.tabsOverflowChanged.connect(this.onTabsOverflowChanged, this);
        return sideBar;
    }

    protected override createContainer(): Panel {
        const contentBox = new BoxLayout({ direction: 'top-to-bottom', spacing: 0 });
        BoxPanel.setStretch(this.toolBar, 0);
        contentBox.addWidget(this.toolBar);
        BoxPanel.setStretch(this.dockPanel, 1);
        contentBox.addWidget(this.dockPanel);
        const contentPanel = new BoxPanel({ layout: contentBox });

        this.activityCloseButton = new QaapActivityBarCloseButton(() => {
            void this.collapse();
        });

        const scrollLayout = new BoxLayout({ direction: 'left-to-right', spacing: 0 });
        BoxPanel.setStretch(this.tabBar, 1);
        BoxPanel.setStretch(this.additionalViewsMenu, 0);
        scrollLayout.addWidget(this.tabBar);
        scrollLayout.addWidget(this.additionalViewsMenu);
        this.activityScrollHost = new BoxPanel({ layout: scrollLayout });
        this.activityScrollHost.addClass('theia-app-activity-bar-scroll-host');

        const activityRowLayout = new BoxLayout({ direction: 'left-to-right', spacing: 0 });
        BoxPanel.setStretch(this.topMenu, 0);
        BoxPanel.setStretch(this.activityScrollHost, 1);
        BoxPanel.setStretch(this.bottomMenu, 0);
        BoxPanel.setStretch(this.activityCloseButton, 0);
        activityRowLayout.addWidget(this.topMenu);
        activityRowLayout.addWidget(this.activityScrollHost);
        activityRowLayout.addWidget(this.bottomMenu);
        activityRowLayout.addWidget(this.activityCloseButton);

        const activityBarRow = new BoxPanel({ layout: activityRowLayout });
        activityBarRow.addClass('theia-app-activity-bar-row');
        activityBarRow.addClass(this.side === 'right' ? 'theia-app-activity-bar-right' : 'theia-app-activity-bar-left');
        activityBarRow.node.style.minHeight = 'var(--theia-horizontal-toolbar-height, 28px)';

        const outerLayout = new BoxLayout({ direction: 'top-to-bottom', spacing: 0 });
        BoxPanel.setStretch(activityBarRow, 0);
        BoxPanel.setStretch(contentPanel, 1);
        outerLayout.addWidget(activityBarRow);
        outerLayout.addWidget(contentPanel);
        const boxPanel = new BoxPanel({ layout: outerLayout });
        boxPanel.id = 'theia-' + this.side + '-content-panel';
        return boxPanel;
    }

    protected observeContainerResize(): void {
        if (typeof ResizeObserver === 'undefined') {
            return;
        }
        this.containerResizeObserver?.disconnect();
        this.containerResizeObserver = new ResizeObserver(entries => {
            const entry = entries[0];
            if (!entry) {
                return;
            }
            const width = Math.round(entry.contentRect.width);
            const height = Math.round(entry.contentRect.height);
            if (width === this.lastObservedWidth && height === this.lastObservedHeight) {
                return;
            }
            this.lastObservedWidth = width;
            this.lastObservedHeight = height;
            if (this.container.isHidden) {
                return;
            }
            if (width <= 0 || height <= 0) {
                if (this.isMobileOneColumnSheetOpen()) {
                    this.scheduleContentRelayout();
                }
                return;
            }
            this.scheduleContentRelayout();
        });
        this.containerResizeObserver.observe(this.container.node);
    }

    protected scheduleContentRelayout(): void {
        if (this.resizeRelayoutFrame !== undefined) {
            return;
        }
        this.resizeRelayoutFrame = requestAnimationFrame(() => {
            this.resizeRelayoutFrame = undefined;
            this.relayoutContent();
        });
    }

    /** Lumino may measure 0×0 while the sheet uses split width 0; force a refit when the sheet is open. */
    relayoutForMobileSheet(): void {
        this.scheduleContentRelayout();
        if (typeof window !== 'undefined') {
            window.requestAnimationFrame(() => this.relayoutContent());
        }
    }

    /** Apply an explicit side panel width (e.g. after leaving mobile layout). */
    applyPanelSize(size: number): Promise<void> {
        return this.setPanelSize(size);
    }

    protected isMobileOneColumnSheetOpen(): boolean {
        const shellNode = this.container.node.closest('#theia-app-shell');
        return !!shellNode?.classList.contains(MOBILE_ONE_COLUMN_LAYOUT_CLASS)
            && !this.container.hasClass(COLLAPSED_CLASS)
            && !this.container.isHidden;
    }

    protected isMobileOneColumnShell(): boolean {
        const shellNode = this.container.node.closest('#theia-app-shell');
        return !!shellNode?.classList.contains(MOBILE_ONE_COLUMN_LAYOUT_CLASS);
    }

    /**
     * On mobile one-column layout, sheets are `position: fixed` and split width is 0 — core
     * {@link SidePanelHandler.collapse} must still clear the tab selection and run {@link refresh}
     * so `theia-mod-collapsed` / off-screen transforms apply.
     */
    override collapse(): Promise<void> {
        if (this.isMobileOneColumnShell() && this.tabBar.currentIndex >= 0) {
            this.tabBar.currentIndex = -1;
        }
        const result = super.collapse();
        if (this.isMobileOneColumnShell()) {
            this.scheduleContentRelayout();
        }
        return result;
    }

    protected relayoutContent(): void {
        if (this.container.isHidden || this.dockPanel.isHidden) {
            return;
        }
        this.relayoutWidget(this.container);
        this.relayoutWidget(this.tabBar);
        this.relayoutWidget(this.additionalViewsMenu);
        this.relayoutWidget(this.toolBar);
        this.relayoutWidget(this.dockPanel);
        const currentWidget = this.tabBar.currentTitle?.owner;
        if (currentWidget) {
            this.relayoutWidget(currentWidget);
        }
    }

    protected relayoutWidget(widget: Widget): void {
        MessageLoop.sendMessage(widget, Widget.ResizeMessage.UnknownSize);
        MessageLoop.postMessage(widget, Widget.Msg.FitRequest);
        MessageLoop.postMessage(widget, Widget.Msg.UpdateRequest);
    }

    override refresh(): void {
        const container = this.container;
        const parent = container.parent;
        const tabBar = this.tabBar;
        const dockPanel = this.dockPanel;
        const isEmpty = tabBar.titles.length === 0;
        const currentTitle = tabBar.currentTitle;
        // eslint-disable-next-line no-null/no-null
        const hideDockPanel = currentTitle === null;
        this.updateSashState(this.container, hideDockPanel);
        let relativeSizes: number[] | undefined;

        if (hideDockPanel) {
            container.addClass(COLLAPSED_CLASS);
            if (this.state.expansion === SidePanel.ExpansionState.expanded && !this.state.empty) {
                const size = this.getPanelSize();
                if (size) {
                    this.state.lastPanelSize = size;
                }
            }
            this.state.expansion = SidePanel.ExpansionState.collapsed;
            void this.setPanelSize(0);
        } else {
            container.removeClass(COLLAPSED_CLASS);
            container.setHidden(false);
            tabBar.setHidden(false);
            this.activityScrollHost?.setHidden(false);
            this.bottomMenu?.setHidden(false);
            this.activityCloseButton?.setHidden(false);
            let size: number | undefined;
            if (this.state.expansion !== SidePanel.ExpansionState.expanded) {
                if (this.state.lastPanelSize) {
                    size = this.state.lastPanelSize;
                } else {
                    size = this.getDefaultPanelSize() ?? this.options.emptySize;
                }
            }
            if (size) {
                this.state.expansion = SidePanel.ExpansionState.expanding;
                if (parent instanceof SplitPanel) {
                    relativeSizes = parent.relativeSizes();
                }
                this.setPanelSize(size).then(() => {
                    if (this.state.expansion === SidePanel.ExpansionState.expanding) {
                        this.state.expansion = SidePanel.ExpansionState.expanded;
                    }
                });
            } else {
                this.state.expansion = SidePanel.ExpansionState.expanded;
            }
        }
        if (this.side === 'left' || hideDockPanel) {
            container.setHidden(hideDockPanel);
            tabBar.setHidden(hideDockPanel);
            this.activityScrollHost?.setHidden(hideDockPanel);
            this.bottomMenu?.setHidden(hideDockPanel);
            this.activityCloseButton?.setHidden(hideDockPanel);
        } else {
            container.setHidden(isEmpty && hideDockPanel);
            tabBar.setHidden(isEmpty);
            this.activityScrollHost?.setHidden(isEmpty);
            this.bottomMenu?.setHidden(isEmpty);
            this.activityCloseButton?.setHidden(isEmpty);
        }
        dockPanel.setHidden(hideDockPanel);
        this.state.empty = isEmpty;
        if (currentTitle) {
            dockPanel.selectWidget(currentTitle.owner);
        }
        if (relativeSizes && parent instanceof SplitPanel) {
            parent.setRelativeSizes(relativeSizes);
        }
        this.updateAdditionalViewsMenu();
    }

    protected override getDefaultPanelSize(): number | undefined {
        const parent = this.container.parent;
        if (!parent) {
            return undefined;
        }
        const ratio = this.options.initialSizeRatio;
        const cw = parent.node.clientWidth;
        if (cw > 0) {
            return Math.max(this.options.emptySize, Math.round(cw * ratio));
        }
        const approx = typeof window !== 'undefined' ? window.innerWidth : 1280;
        return Math.max(this.options.emptySize, Math.round(approx * ratio));
    }

    protected override setPanelSize(size: number): Promise<void> {
        const enableAnimation = this.applicationStateService.state === 'ready';
        const options: SplitPositionOptions = {
            side: this.side,
            duration: enableAnimation ? this.options.expandDuration : 0,
            referenceWidget: undefined
        };
        const promise = this.splitPositionHandler.setSidePanelSize(this.container, size, options);
        const result = new Promise<void>(resolve => {
            promise.then(() => resolve(), () => resolve());
        });
        void result.then(() => this.scheduleContentRelayout());
        this.state.pendingUpdate = this.state.pendingUpdate.then(() => result);
        return result;
    }

    protected override onTabsOverflowChanged(sender: SideTabBar, event: { titles: Title<Widget>[], startIndex: number }): void {
        if (event.startIndex > 0 && event.startIndex <= sender.currentIndex) {
            sender.revealTab(sender.currentIndex);
        } else {
            this.additionalViewsMenu.updateAdditionalViews(sender, event);
        }
    }

    protected updateAdditionalViewsMenu(): void {
        if (!this.additionalViewsMenu) {
            return;
        }
        const titles = toArray(this.tabBar.titles);
        this.additionalViewsMenu.updateAdditionalViews(this.tabBar, { titles, startIndex: -1 });
    }
}
