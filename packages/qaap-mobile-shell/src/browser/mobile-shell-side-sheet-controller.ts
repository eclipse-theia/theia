// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { toArray } from '@lumino/algorithm';
import { MessageLoop } from '@lumino/messaging';
import { Panel, Widget as LuminoWidget } from '@lumino/widgets';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { CommonCommands } from '@theia/core/lib/browser/common-commands';
import { ApplicationShell, MAXIMIZED_CLASS } from '@theia/core/lib/browser/shell/application-shell';
import {
    EDIT_CHAT_SESSION_SETTINGS_COMMAND,
    OPEN_AI_CONFIGURATION_COMMAND,
    WORKBENCH_TOGGLE_TERMINAL,
} from './mobile-shell-bottom-bar-widget';
import type { MobileShellBottomBarController } from './mobile-shell-bottom-bar-controller';

export interface MobileShellSideSheetHost {
    isMobileActive(): boolean;
    forceCenterColumnFullWidth(): void;
    persistAgentsSurfaceForActiveSession(): void;
    updateMobileShellStateClasses(): void;
    refreshBottomBar(): void;
    updateBackdropVisibility(): void;
    syncIdeMiniBrowserPreviewSuspension(): void;
    getBottomPanelPendingUpdate(): Promise<void>;
    prepareSideSheetOpen(side: 'left' | 'right'): Promise<void>;
    mountSideSheetWidget(side: 'left' | 'right', widgetId: string): Promise<void>;
}

export interface MobileShellSideSheetControllerOptions {
    host: MobileShellSideSheetHost;
    shell: ApplicationShell;
    commands: CommandRegistry;
    bottomBarController: MobileShellBottomBarController;
}

/** Side sheets, shell hooks, snap/relayout loop, and sheet collapse helpers. */
export class MobileShellSideSheetController {

    protected shellHooked = false;
    protected snapRaf = 0;

    protected readonly host: MobileShellSideSheetHost;
    protected readonly shell: ApplicationShell;
    protected readonly commands: CommandRegistry;
    protected readonly bottomBarController: MobileShellBottomBarController;

    constructor(options: MobileShellSideSheetControllerOptions) {
        this.host = options.host;
        this.shell = options.shell;
        this.commands = options.commands;
        this.bottomBarController = options.bottomBarController;
    }

    ensureShellHooks(shell: ApplicationShell, toDispose: DisposableCollection): void {
        if (this.shellHooked || shell !== this.shell) {
            return;
        }
        this.shellHooked = true;
        const leftBar = shell.leftPanelHandler.tabBar;
        const rightBar = shell.rightPanelHandler.tabBar;
        toDispose.pushAll([
            Disposable.create(() => { leftBar.currentChanged.disconnect(this.onSidePanelTabChanged); }),
            Disposable.create(() => { rightBar.currentChanged.disconnect(this.onSidePanelTabChanged); }),
        ]);
        leftBar.currentChanged.connect(this.onSidePanelTabChanged);
        rightBar.currentChanged.connect(this.onSidePanelTabChanged);
        toDispose.push(shell.onDidChangeActiveWidget(() => {
            if (this.host.isMobileActive()) {
                this.host.refreshBottomBar();
            }
        }));
        toDispose.push(shell.onDidChangeCurrentWidget(() => {
            if (this.host.isMobileActive()) {
                this.host.refreshBottomBar();
            }
        }));
        const bottomPanel = shell.bottomPanel;
        const onBottomPanelLayout = (): void => {
            if (this.host.isMobileActive()) {
                this.scheduleSnapAndUiRefresh();
            }
        };
        bottomPanel.widgetAdded.connect(onBottomPanelLayout);
        bottomPanel.widgetRemoved.connect(onBottomPanelLayout);
        toDispose.pushAll([
            Disposable.create(() => { bottomPanel.widgetAdded.disconnect(onBottomPanelLayout); }),
            Disposable.create(() => { bottomPanel.widgetRemoved.disconnect(onBottomPanelLayout); }),
        ]);
        toDispose.push(shell.onDidAddWidget(widget => {
            if (this.host.isMobileActive() && shell.getAreaFor(widget) === 'bottom') {
                this.scheduleSnapAndUiRefresh();
                void this.bottomBarController.applyMobileBottomPanelMaximizedSize();
            }
        }));
        toDispose.push(shell.onDidRemoveWidget(widget => {
            if (this.host.isMobileActive() && shell.getAreaFor(widget) === 'bottom') {
                this.scheduleSnapAndUiRefresh();
            }
        }));
        toDispose.push(shell.onDidToggleMaximized(() => {
            if (!this.host.isMobileActive()) {
                return;
            }
            if (!this.shell.bottomPanel.hasClass(MAXIMIZED_CLASS) && this.shell.isExpanded('bottom')) {
                this.bottomBarController.suppressMobileBottomAutoMaximize = true;
            }
            this.bottomBarController.syncMobileMaximizedOverlayInsets();
        }));
        toDispose.push(this.commands.onWillExecuteCommand(event => {
            if (!this.host.isMobileActive()) {
                return;
            }
            if (event.commandId === OPEN_AI_CONFIGURATION_COMMAND || event.commandId === EDIT_CHAT_SESSION_SETTINGS_COMMAND) {
                void this.dismissMobileSideSheets();
            }
        }));
        toDispose.push(this.commands.onDidExecuteCommand(event => {
            if (!this.host.isMobileActive()) {
                return;
            }
            if (event.commandId === WORKBENCH_TOGGLE_TERMINAL
                || event.commandId === CommonCommands.TOGGLE_BOTTOM_PANEL.id
                || event.commandId === 'terminal:new') {
                this.scheduleSnapAndUiRefresh();
                void this.bottomBarController.applyMobileBottomPanelMaximizedSize();
            }
        }));
    }

    protected readonly onSidePanelTabChanged = (): void => {
        this.scheduleSnapAndUiRefresh();
    };

    scheduleSnapAndUiRefresh(): void {
        if (!this.host.isMobileActive()) {
            return;
        }
        this.host.persistAgentsSurfaceForActiveSession();
        if (this.snapRaf) {
            cancelAnimationFrame(this.snapRaf);
        }
        this.snapRaf = requestAnimationFrame(() => {
            this.snapRaf = 0;
            const snap = (): void => {
                this.snapCenterFullWidth();
                this.host.updateMobileShellStateClasses();
                this.host.refreshBottomBar();
                this.host.updateBackdropVisibility();
                this.requestSheetRelayout();
                this.host.syncIdeMiniBrowserPreviewSuspension();
            };
            void Promise.all([
                this.shell.leftPanelHandler.state.pendingUpdate,
                this.shell.rightPanelHandler.state.pendingUpdate,
                this.host.getBottomPanelPendingUpdate(),
            ]).then(snap, snap);
        });
    }

    async dismissMobileSideSheets(): Promise<void> {
        await this.collapseMobileSideSheets();
        this.host.updateBackdropVisibility();
        if (this.host.isMobileActive()) {
            this.scheduleSnapAndUiRefresh();
        }
    }

    async dismissSheetsAsync(): Promise<void> {
        await this.dismissMobileSideSheets();
    }

    async collapseMobileSideSheets(): Promise<void> {
        const tasks: Promise<void>[] = [];
        if (this.shell.isExpanded('left')) {
            tasks.push(this.shell.collapsePanel('left'));
        }
        if (this.shell.isExpanded('right')) {
            tasks.push(this.shell.collapsePanel('right'));
        }
        if (this.shell.isExpanded('bottom')) {
            tasks.push(this.shell.collapsePanel('bottom'));
        }
        if (tasks.length) {
            await Promise.all(tasks);
        }
    }

    async collapseMobileSidePanels(): Promise<void> {
        const tasks: Promise<void>[] = [];
        if (this.shell.isExpanded('left') || !this.isSidePanelSheetCollapsedInDom('left')) {
            tasks.push(this.shell.collapsePanel('left'));
        }
        if (this.shell.isExpanded('right') || !this.isSidePanelSheetCollapsedInDom('right')) {
            tasks.push(this.shell.collapsePanel('right'));
        }
        if (tasks.length) {
            await Promise.all(tasks);
        }
        this.markMobileSidePanelCollapsed('left');
        this.markMobileSidePanelCollapsed('right');
        this.host.updateBackdropVisibility();
    }

    settleMobileSidePanelsCollapsed(): void {
        window.requestAnimationFrame(() => {
            void this.collapseMobileSidePanels();
            window.setTimeout(() => { void this.collapseMobileSidePanels(); }, 150);
        });
    }

    markMobileSidePanelCollapsed(side: 'left' | 'right'): void {
        if (!this.host.isMobileActive() || this.shell.isExpanded(side)) {
            return;
        }
        const id = side === 'left' ? 'theia-left-content-panel' : 'theia-right-content-panel';
        document.getElementById(id)?.classList.add('theia-mod-collapsed', 'lm-mod-hidden');
    }

    isSidePanelSheetCollapsedInDom(side: 'left' | 'right'): boolean {
        const id = side === 'left' ? 'theia-left-content-panel' : 'theia-right-content-panel';
        const panel = document.getElementById(id);
        return !panel
            || panel.classList.contains('theia-mod-collapsed')
            || panel.classList.contains('lm-mod-hidden');
    }

    isAnyMobileSideSheetVisible(): boolean {
        const leftOpen = this.shell.isExpanded('left') && !this.isSidePanelSheetCollapsedInDom('left');
        const rightOpen = this.shell.isExpanded('right') && !this.isSidePanelSheetCollapsedInDom('right');
        return leftOpen || rightOpen;
    }

    resetSheetScroll(side: 'left' | 'right'): void {
        if (!this.shell.isExpanded(side)) {
            return;
        }
        const container = side === 'left' ? this.shell.leftPanelHandler.container : this.shell.rightPanelHandler.container;
        const root = container.node;
        const scrollers = root.querySelectorAll<HTMLElement>(
            '[data-virtuoso-scroller="true"], .body.ps, .ps[tabindex]'
        );
        scrollers.forEach(el => {
            if (el.scrollTop > 0) {
                el.scrollTop = 0;
            }
        });
    }

    snapCenterFullWidth(): void {
        if (!this.host.isMobileActive()) {
            return;
        }
        this.host.forceCenterColumnFullWidth();
        this.requestSheetRelayout();
    }

    requestSheetRelayout(): void {
        if (!this.host.isMobileActive() || typeof window === 'undefined') {
            return;
        }
        requestAnimationFrame(() => {
            if (!this.host.isMobileActive()) {
                return;
            }
            if (this.shell.isExpanded('left')) {
                this.relayoutMobileSidePanelHandler('left');
            }
            if (this.shell.isExpanded('right')) {
                this.relayoutMobileSidePanelHandler('right');
            }
        });
    }

    relayoutSheetTree(widget: LuminoWidget): void {
        MessageLoop.sendMessage(widget, LuminoWidget.ResizeMessage.UnknownSize);
        MessageLoop.postMessage(widget, LuminoWidget.Msg.FitRequest);
        MessageLoop.postMessage(widget, LuminoWidget.Msg.UpdateRequest);
        if (widget instanceof Panel) {
            for (const child of toArray(widget.widgets)) {
                this.relayoutSheetTree(child);
            }
        }
    }

    relayoutMobileSidePanelHandler(side: 'left' | 'right'): void {
        const handler = side === 'left' ? this.shell.leftPanelHandler : this.shell.rightPanelHandler;
        const relayoutForMobileSheet = (handler as unknown as { relayoutForMobileSheet?: () => void }).relayoutForMobileSheet;
        if (typeof relayoutForMobileSheet === 'function') {
            relayoutForMobileSheet.call(handler);
        } else {
            this.relayoutSheetTree(handler.container);
        }
    }

    async openMobileSideSheet(side: 'left' | 'right', widgetId: string): Promise<void> {
        try {
            await this.host.prepareSideSheetOpen(side);
            await this.host.mountSideSheetWidget(side, widgetId);
            const handler = side === 'left' ? this.shell.leftPanelHandler : this.shell.rightPanelHandler;
            await handler.state.pendingUpdate;
            this.relayoutMobileSidePanelHandler(side);
            this.resetSheetScroll(side);
        } catch (e) {
            console.error(`[qaap-mobile-shell] openMobileSideSheet(${side}, ${widgetId})`, e);
        }
    }

}
