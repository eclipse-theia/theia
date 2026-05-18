// *****************************************************************************
// Copyright (C) 2026 theia-ide and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { ArrayExt, toArray } from '@lumino/algorithm';
import { MessageLoop } from '@lumino/messaging';
import { BoxLayout, BoxPanel, Panel, SplitPanel, Widget as LuminoWidget } from '@lumino/widgets';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { nls } from '@theia/core/lib/common/nls';
import { CommonCommands } from '@theia/core/lib/browser/common-commands';
import { FrontendApplication } from '@theia/core/lib/browser/frontend-application';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { StatusBarImpl } from '@theia/core/lib/browser/status-bar/status-bar';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { MOBILE_NARROW_VIEWPORT_MEDIA_QUERY, MOBILE_ONE_COLUMN_LAYOUT_CLASS } from '@theia/core/lib/browser/shell/mobile-layout-state';
import { hasQaapLeftRightSplitPanel } from '@theia/qaap-shell/lib/browser/qaap-shell-layout';
import { QaapSidePanelHandler } from '@theia/qaap-shell/lib/browser/qaap-side-panel-handler';
import { MobileHaptics } from './mobile-haptics';
import { installMobileHorizontalTouchScroll } from './mobile-horizontal-touch-scroll';
import { MobileKeyboardHelper } from './mobile-keyboard-helper';
import { MobileProjectsService } from './mobile-projects-service';
import { MobileProjectsPanel } from './mobile-projects-panel';
import { MobileProjectEntry } from './mobile-projects-types';
import { MobilePullRequestPanel } from './mobile-pull-request-panel';

class MobileBottomBarWidget extends LuminoWidget {
    constructor() {
        const node = document.createElement('nav');
        node.className = 'theia-mobile-bottom-activity-bar';
        node.setAttribute('role', 'navigation');
        super({ node });
        this.id = 'theia-mobile-bottom-bar';
    }
}

/**
 * Commands referenced for active-state and click-through; declared as strings so `@theia/core` stays free of
 * optional dependencies (`@theia/ai-chat-ui`, `@theia/terminal`, `@theia/mini-browser`, …).
 * Breakpoint for the shell matches {@link mobile-workbench.css} / {@link MOBILE_NARROW_VIEWPORT_MEDIA_QUERY}.
 */
const WORKBENCH_AI_CHAT_TOGGLE = 'aiChat:toggle';
const WORKBENCH_CHAT_VIEW_WIDGET_ID = 'chat-view-widget';
const WORKBENCH_TOGGLE_TERMINAL = 'workbench.action.terminal.toggleTerminal';
const WORKBENCH_TASKS_RUN = 'workbench.action.tasks.runTask';
const WORKBENCH_OPEN_DIFF = 'editor.action.diffReview.next';
const MINI_BROWSER_OPEN_URL = 'mini-browser.openUrl';
const GETTING_STARTED_WIDGET_COMMAND = 'getting.started.widget';
const EXPLORER_VIEW_CONTAINER_ID = 'explorer-view-container';
const VSX_EXTENSIONS_VIEW_CONTAINER_ID = 'vsx-extensions-view-container';
const OPEN_AI_CONFIGURATION_COMMAND = 'aiConfiguration:open';
const EDIT_CHAT_SESSION_SETTINGS_COMMAND = 'chat:widget:session-settings';

/** Shell class toggled while the bottom (terminal) panel is expanded on mobile. */
const MOBILE_BOTTOM_OPEN_CLASS = 'theia-mod-mobile-bottom-open';

type MobileBottomButtonId = 'projects' | 'agent' | 'preview' | 'plan' | 'pr' | 'diff' | 'tasks' | 'skills' | 'terminal';

interface MobileBottomButton {
    id: MobileBottomButtonId;
    label: string;
    icon: string;
    commandId?: string;
}

/**
 * Narrow-viewport workbench: full-width editor, side panels as sheets, bottom activity strip,
 * edge swipes and backdrop; main editor tabs in a horizontally scrollable tab row.
 */
@injectable()
export class MobileOneColumnShellContribution implements FrontendApplicationContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(StatusBarImpl)
    protected readonly statusBar: StatusBarImpl;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(MobileProjectsService)
    protected readonly projectsService: MobileProjectsService;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    protected readonly toDispose = new DisposableCollection();
    protected readonly mobileMq: MediaQueryList | undefined =
        typeof window !== 'undefined' ? window.matchMedia(MOBILE_NARROW_VIEWPORT_MEDIA_QUERY) : undefined;

    protected backdrop: HTMLElement | undefined;
    protected bottomChromeHost: HTMLElement | undefined;
    protected bottomChromeTouchScrollDispose = Disposable.NULL;
    protected statusBarShellIndex = -1;
    protected bottomBarWidget: MobileBottomBarWidget | undefined;
    protected get bottomBar(): HTMLElement | undefined { return this.bottomBarWidget?.node; }
    protected leftEdge: HTMLElement | undefined;
    protected rightEdge: HTMLElement | undefined;
    protected closeButton: HTMLButtonElement | undefined;
    protected keyboardHelper: MobileKeyboardHelper | undefined;
    protected mobileActive = false;
    protected snapRaf = 0;
    protected shellHooked = false;
    protected projectsPanel: MobileProjectsPanel | undefined;
    protected pullRequestPanel: MobilePullRequestPanel | undefined;
    protected projectsCount = 0;

    protected leftEdgeTouchStartX = 0;
    protected rightEdgeTouchStartX = 0;

    onStart(_app: FrontendApplication): void {
        this.mobileMq?.addEventListener('change', this.onMediaChange);
        window.addEventListener('resize', this.onWindowResize);
        if (this.mobileMq?.matches) {
            window.requestAnimationFrame(() => this.onMediaChange());
        }
    }

    onDidInitializeLayout(app: FrontendApplication): void {
        this.ensureShellHooks(app.shell);
        this.onMediaChange();
        if (this.mobileActive) {
            void this.collapseMobileSideSheets().then(() => {
                void this.ensureWelcomeInMainArea();
                this.scheduleSnapAndUiRefresh();
            });
        } else {
            void this.ensureWelcomeInMainArea();
            window.requestAnimationFrame(() => this.ensureDesktopSidePanelSizes());
        }
    }

    onStop(_app: FrontendApplication): void {
        this.mobileMq?.removeEventListener('change', this.onMediaChange);
        window.removeEventListener('resize', this.onWindowResize);
        this.teardownMobileUi();
        this.toDispose.dispose();
    }

    protected readonly onMediaChange = (): void => {
        if (this.mobileMq?.matches) {
            this.enterMobileLayout();
        } else {
            this.leaveMobileLayout();
        }
    };

    protected readonly onWindowResize = (): void => {
        this.onMediaChange();
    };

    protected ensureShellHooks(shell: ApplicationShell): void {
        if (this.shellHooked || shell !== this.shell) {
            return;
        }
        this.shellHooked = true;
        const leftBar = shell.leftPanelHandler.tabBar;
        const rightBar = shell.rightPanelHandler.tabBar;
        this.toDispose.pushAll([
            Disposable.create(() => { leftBar.currentChanged.disconnect(this.onSidePanelTabChanged); }),
            Disposable.create(() => { rightBar.currentChanged.disconnect(this.onSidePanelTabChanged); }),
        ]);
        leftBar.currentChanged.connect(this.onSidePanelTabChanged);
        rightBar.currentChanged.connect(this.onSidePanelTabChanged);
        this.toDispose.push(shell.onDidChangeActiveWidget(() => {
            if (this.mobileActive) {
                this.refreshBottomBar();
            }
        }));
        this.toDispose.push(shell.onDidChangeCurrentWidget(() => {
            if (this.mobileActive) {
                this.refreshBottomBar();
            }
        }));
        const bottomPanel = shell.bottomPanel;
        const onBottomPanelLayout = (): void => {
            if (this.mobileActive) {
                this.scheduleSnapAndUiRefresh();
            }
        };
        bottomPanel.widgetAdded.connect(onBottomPanelLayout);
        bottomPanel.widgetRemoved.connect(onBottomPanelLayout);
        this.toDispose.pushAll([
            Disposable.create(() => { bottomPanel.widgetAdded.disconnect(onBottomPanelLayout); }),
            Disposable.create(() => { bottomPanel.widgetRemoved.disconnect(onBottomPanelLayout); }),
        ]);
        this.toDispose.push(shell.onDidAddWidget(widget => {
            if (this.mobileActive && shell.getAreaFor(widget) === 'bottom') {
                this.scheduleSnapAndUiRefresh();
            }
        }));
        this.toDispose.push(shell.onDidRemoveWidget(widget => {
            if (this.mobileActive && shell.getAreaFor(widget) === 'bottom') {
                this.scheduleSnapAndUiRefresh();
            }
        }));
        this.toDispose.push(this.commands.onWillExecuteCommand(event => {
            if (!this.mobileActive) {
                return;
            }
            if (event.commandId === OPEN_AI_CONFIGURATION_COMMAND || event.commandId === EDIT_CHAT_SESSION_SETTINGS_COMMAND) {
                void this.dismissMobileSideSheets();
            }
        }));
    }

    /** Bottom panel is visible with at least one widget (matches Projects “open” semantics for the bar). */
    protected isTerminalBottomPanelOpen(): boolean {
        const bottom = this.shell.bottomPanel;
        return !bottom.isHidden && !bottom.isEmpty;
    }

    protected getBottomPanelPendingUpdate(): Promise<void> {
        const state = (this.shell as ApplicationShell & { bottomPanelState?: { pendingUpdate: Promise<void> } }).bottomPanelState;
        return state?.pendingUpdate ?? Promise.resolve();
    }

    protected readonly onSidePanelTabChanged = (): void => {
        this.scheduleSnapAndUiRefresh();
    };

    protected enterMobileLayout(): void {
        this.ensureShellHooks(this.shell);
        if (this.mobileActive) {
            return;
        }
        this.mobileActive = true;
        this.shell.node.classList.add(MOBILE_ONE_COLUMN_LAYOUT_CLASS);
        this.forceCenterColumnFullWidth();
        this.ensureOverlayElements();
        // Restored layout often leaves a side sheet expanded; collapse so the editor column is visible.
        void this.collapseMobileSideSheets().then(async () => {
            await this.ensureWelcomeInMainArea();
            this.scheduleSnapAndUiRefresh();
        });
    }

    protected leaveMobileLayout(): void {
        if (!this.mobileActive) {
            return;
        }
        this.mobileActive = false;
        this.shell.node.classList.remove(MOBILE_ONE_COLUMN_LAYOUT_CLASS);
        this.teardownMobileUi();
        this.restoreDesktopSplitLayout();
        window.requestAnimationFrame(() => {
            void this.ensureDesktopSidePanelSizes();
            this.requestFullShellRelayout();
        });
    }

    /** Reset split + side panel pixel sizes after mobile (persisted layout often keeps width 0). */
    protected async ensureDesktopSidePanelSizes(): Promise<void> {
        if (this.mobileMq?.matches || !hasQaapLeftRightSplitPanel(this.shell)) {
            return;
        }
        this.restoreDesktopSplitLayout();
        const splitWidth = this.shell.leftRightSplitPanel.node.clientWidth;
        if (splitWidth <= 0) {
            return;
        }
        const target = Math.max(280, Math.min(360, Math.round(splitWidth * 0.22)));
        if (this.shell.isExpanded('left')) {
            await this.setSidePanelSize('left', target);
        }
        if (this.shell.isExpanded('right')) {
            await this.setSidePanelSize('right', target);
        }
        this.requestFullShellRelayout();
    }

    protected async setSidePanelSize(side: 'left' | 'right', size: number): Promise<void> {
        const handler = side === 'left' ? this.shell.leftPanelHandler : this.shell.rightPanelHandler;
        if (handler instanceof QaapSidePanelHandler) {
            await handler.applyPanelSize(size);
        }
    }

    protected restoreDesktopSplitLayout(): void {
        if (!hasQaapLeftRightSplitPanel(this.shell)) {
            return;
        }
        try {
            // Leave desktop sidebars collapsed by default; individual views restore/expand themselves.
            this.shell.leftRightSplitPanel.setRelativeSizes([0, 1, 0]);
        } catch {
            /* layout not ready */
        }
        const bottomSplit = this.getBottomAreaSplitPanel();
        if (bottomSplit) {
            try {
                bottomSplit.setRelativeSizes([1, 0]);
            } catch {
                /* layout not ready */
            }
        }
    }

    protected forceCenterColumnFullWidth(): void {
        if (!hasQaapLeftRightSplitPanel(this.shell)) {
            return;
        }
        try {
            // Side sheets are `position: fixed` overlays — center must always keep full split width
            // so the editor stack and bottom (terminal) panel can lay out inside #theia-bottom-split-panel.
            this.shell.leftRightSplitPanel.setRelativeSizes([0, 1, 0]);
        } catch {
            /* layout not ready */
        }
        this.syncMobileBottomSplit();
    }

    protected getBottomAreaSplitPanel(): SplitPanel | undefined {
        const parent = this.shell.mainPanel.parent;
        return parent instanceof SplitPanel ? parent : undefined;
    }

    /** Vertical split between main editor and terminal panel inside the center column. */
    protected syncMobileBottomSplit(): void {
        const split = this.getBottomAreaSplitPanel();
        if (!split) {
            return;
        }
        try {
            if (this.shell.isExpanded('bottom')) {
                split.setRelativeSizes([0.52, 0.48]);
            } else {
                split.setRelativeSizes([1, 0]);
            }
        } catch {
            /* layout not ready */
        }
    }

    protected updateMobileShellStateClasses(): void {
        this.shell.node.classList.toggle(MOBILE_BOTTOM_OPEN_CLASS, this.shell.isExpanded('bottom'));
    }

    protected requestFullShellRelayout(): void {
        MessageLoop.sendMessage(this.shell, LuminoWidget.ResizeMessage.UnknownSize);
        MessageLoop.postMessage(this.shell, LuminoWidget.Msg.FitRequest);
        MessageLoop.postMessage(this.shell, LuminoWidget.Msg.UpdateRequest);
        MessageLoop.postMessage(this.shell.mainPanel, LuminoWidget.Msg.FitRequest);
        if (!hasQaapLeftRightSplitPanel(this.shell)) {
            return;
        }
        const split = this.shell.leftRightSplitPanel;
        MessageLoop.sendMessage(split, LuminoWidget.ResizeMessage.UnknownSize);
        MessageLoop.postMessage(split, LuminoWidget.Msg.FitRequest);
        MessageLoop.postMessage(split, LuminoWidget.Msg.UpdateRequest);
        for (const child of toArray(split.widgets)) {
            MessageLoop.sendMessage(child, LuminoWidget.ResizeMessage.UnknownSize);
            MessageLoop.postMessage(child, LuminoWidget.Msg.FitRequest);
            MessageLoop.postMessage(child, LuminoWidget.Msg.UpdateRequest);
        }
        if (this.shell.isExpanded('left')) {
            this.relayoutMobileSidePanelHandler('left');
        }
        if (this.shell.isExpanded('right')) {
            this.relayoutMobileSidePanelHandler('right');
        }
        MessageLoop.postMessage(this.shell.mainPanel, LuminoWidget.Msg.UpdateRequest);
    }

    protected teardownMobileUi(): void {
        this.removeBackdrop();
        this.unpinBottomChromeFromBody();
        this.detachBottomBarFromShell();
        if (this.leftEdge?.parentElement) {
            this.leftEdge.removeEventListener('touchstart', this.onLeftEdgeTouchStart);
            this.leftEdge.removeEventListener('touchend', this.onLeftEdgeTouchEnd);
            this.leftEdge.parentElement.removeChild(this.leftEdge);
        }
        this.leftEdge = undefined;
        if (this.rightEdge?.parentElement) {
            this.rightEdge.removeEventListener('touchstart', this.onRightEdgeTouchStart);
            this.rightEdge.removeEventListener('touchend', this.onRightEdgeTouchEnd);
            this.rightEdge.parentElement.removeChild(this.rightEdge);
        }
        this.rightEdge = undefined;
        this.removeCloseButton();
        this.keyboardHelper?.dispose();
        this.keyboardHelper = undefined;
        this.hideProjectsPanel();
        if (this.projectsPanel?.node.parentElement) {
            this.projectsPanel.node.parentElement.removeChild(this.projectsPanel.node);
        }
        this.projectsPanel = undefined;
        this.hidePullRequestPanel();
        if (this.pullRequestPanel?.node.parentElement) {
            this.pullRequestPanel.node.parentElement.removeChild(this.pullRequestPanel.node);
        }
        this.pullRequestPanel = undefined;
        this.shell.node.classList.remove(MOBILE_BOTTOM_OPEN_CLASS);
    }

    protected removeBackdrop(): void {
        if (this.backdrop?.parentElement) {
            this.backdrop.removeEventListener('click', this.onBackdropClick);
            this.backdrop.parentElement.removeChild(this.backdrop);
        }
        this.backdrop = undefined;
    }

    protected ensureOverlayElements(): void {
        if (!this.mobileActive) {
            return;
        }
        this.removeBackdrop();
        if (!this.bottomBarWidget) {
            this.bottomBarWidget = new MobileBottomBarWidget();
            this.bottomBarWidget.node.setAttribute(
                'aria-label',
                nls.localize('theia/core/mobileBottomBar', 'Primary views')
            );
        }
        this.pinBottomChromeToBody();
        if (!this.leftEdge) {
            this.leftEdge = document.createElement('div');
            this.leftEdge.className = 'theia-mobile-edgeSwipeZone theia-mobile-edgeSwipeZone-left';
            this.leftEdge.addEventListener('touchstart', this.onLeftEdgeTouchStart, { passive: true });
            this.leftEdge.addEventListener('touchend', this.onLeftEdgeTouchEnd, { passive: true });
            document.body.appendChild(this.leftEdge);
        }
        if (!this.rightEdge) {
            this.rightEdge = document.createElement('div');
            this.rightEdge.className = 'theia-mobile-edgeSwipeZone theia-mobile-edgeSwipeZone-right';
            this.rightEdge.addEventListener('touchstart', this.onRightEdgeTouchStart, { passive: true });
            this.rightEdge.addEventListener('touchend', this.onRightEdgeTouchEnd, { passive: true });
            document.body.appendChild(this.rightEdge);
        }
        this.ensureCloseButton();
        if (!this.keyboardHelper) {
            this.keyboardHelper = new MobileKeyboardHelper(this.shell.node);
            this.keyboardHelper.install();
        }
        this.ensureProjectsPanel();
        this.ensurePullRequestPanel();
        void this.refreshProjectsCount();
        this.refreshBottomBar();
        this.updateBackdropVisibility();
    }

    protected ensureProjectsPanel(): void {
        if (this.projectsPanel) {
            return;
        }
        this.projectsPanel = new MobileProjectsPanel(
            this.projectsService,
            this.commands,
            {
                onProjectOpen: (project: MobileProjectEntry) => { void this.onProjectsPanelOpen(project); },
                onDismiss: () => this.scheduleSnapAndUiRefresh(),
                onProjectsChanged: () => { void this.refreshProjectsCount().then(() => this.refreshBottomBar()); },
            }
        );
        this.shell.node.appendChild(this.projectsPanel.node);
    }

    protected ensurePullRequestPanel(): void {
        if (this.pullRequestPanel) {
            return;
        }
        this.pullRequestPanel = new MobilePullRequestPanel({
            onDismiss: () => this.scheduleSnapAndUiRefresh(),
        });
        this.shell.node.appendChild(this.pullRequestPanel.node);
    }

    protected async refreshProjectsCount(): Promise<void> {
        try {
            const projects = await this.projectsService.loadProjects();
            this.projectsCount = projects.length;
        } catch {
            this.projectsCount = 0;
        }
    }

    protected hideProjectsPanel(): void {
        this.projectsPanel?.hide();
    }

    protected hidePullRequestPanel(): void {
        this.pullRequestPanel?.hide();
    }

    protected async toggleProjectsPanel(): Promise<void> {
        this.ensureProjectsPanel();
        const panel = this.projectsPanel;
        if (!panel) {
            return;
        }
        if (panel.isVisible()) {
            panel.hide();
            this.scheduleSnapAndUiRefresh();
            return;
        }
        this.hidePullRequestPanel();
        await this.dismissSheetsAsync();
        if (this.shell.isExpanded('bottom')) {
            await this.shell.collapsePanel('bottom');
        }
        await panel.show();
        this.refreshBottomBar();
    }

    protected async togglePullRequestPanel(): Promise<void> {
        this.ensurePullRequestPanel();
        const panel = this.pullRequestPanel;
        if (!panel) {
            return;
        }
        if (panel.isVisible()) {
            panel.hide();
            this.scheduleSnapAndUiRefresh();
            return;
        }
        this.hideProjectsPanel();
        await this.dismissSheetsAsync();
        if (this.shell.isExpanded('bottom')) {
            await this.shell.collapsePanel('bottom');
        }
        panel.show();
        this.refreshBottomBar();
    }

    protected async onProjectsPanelOpen(project: MobileProjectEntry): Promise<void> {
        const panel = this.projectsPanel;
        if (!panel) {
            return;
        }
        await panel.openProject(project);
        panel.hide();
        this.scheduleSnapAndUiRefresh();
    }

    /**
     * Bottom activity strip + status bar live on `document.body` in mobile mode so Lumino layout
     * metrics and shell height cannot leave a gap under the status track.
     */
    protected ensureBottomChromeHost(): HTMLElement {
        if (!this.bottomChromeHost) {
            const host = document.createElement('div');
            host.className = 'theia-mobile-bottom-chrome-host';
            host.setAttribute('aria-hidden', 'false');
            document.body.appendChild(host);
            this.bottomChromeHost = host;
        }
        return this.bottomChromeHost;
    }

    protected pinBottomChromeToBody(): void {
        const bottomWidget = this.bottomBarWidget;
        if (!bottomWidget) {
            return;
        }
        const host = this.ensureBottomChromeHost();
        const layout = this.shell.layout as BoxLayout | null;
        if (layout instanceof BoxLayout && this.statusBar.parent === this.shell) {
            const widgets = layout.widgets as ReadonlyArray<LuminoWidget>;
            this.statusBarShellIndex = ArrayExt.findFirstIndex(widgets, w => w === this.statusBar);
            if (this.statusBarShellIndex >= 0) {
                layout.removeWidget(this.statusBar);
            }
        }
        if (bottomWidget.parent) {
            bottomWidget.parent = null;
        }
        BoxPanel.setStretch(bottomWidget, 0);
        if (!host.contains(bottomWidget.node)) {
            host.appendChild(bottomWidget.node);
        }
        if (!host.contains(this.statusBar.node)) {
            host.appendChild(this.statusBar.node);
        }
        this.installBottomChromeTouchScroll();
        MessageLoop.postMessage(this.shell, LuminoWidget.Msg.FitRequest);
    }

    protected installBottomChromeTouchScroll(): void {
        this.bottomChromeTouchScrollDispose.dispose();
        if (typeof window === 'undefined') {
            return;
        }
        const coarse = window.matchMedia('(pointer: coarse)').matches;
        const narrow = this.mobileMq?.matches ?? false;
        if (!coarse && !narrow) {
            this.bottomChromeTouchScrollDispose = Disposable.NULL;
            return;
        }
        const bottomNode = this.bottomBarWidget?.node;
        const toDispose = new DisposableCollection();
        if (bottomNode) {
            toDispose.push(installMobileHorizontalTouchScroll(bottomNode));
        }
        toDispose.push(installMobileHorizontalTouchScroll(this.statusBar.node));
        this.bottomChromeTouchScrollDispose = toDispose;
    }

    protected unpinBottomChromeFromBody(): void {
        this.bottomChromeTouchScrollDispose.dispose();
        this.bottomChromeTouchScrollDispose = Disposable.NULL;
        if (this.bottomChromeHost) {
            while (this.bottomChromeHost.firstChild) {
                this.bottomChromeHost.removeChild(this.bottomChromeHost.firstChild);
            }
            this.bottomChromeHost.parentElement?.removeChild(this.bottomChromeHost);
            this.bottomChromeHost = undefined;
        }
        const layout = this.shell.layout as BoxLayout | null;
        if (layout instanceof BoxLayout && this.statusBar.parent !== this.shell) {
            if (this.statusBarShellIndex >= 0) {
                layout.insertWidget(this.statusBarShellIndex, this.statusBar);
            } else {
                layout.addWidget(this.statusBar);
            }
            BoxPanel.setStretch(this.statusBar, 0);
            MessageLoop.postMessage(this.shell, LuminoWidget.Msg.FitRequest);
        }
        this.statusBarShellIndex = -1;
    }

    protected detachBottomBarFromShell(): void {
        const widget = this.bottomBarWidget;
        if (!widget) {
            return;
        }
        if (widget.parent) {
            widget.parent = null;
        }
        this.bottomBarWidget = undefined;
    }

    protected readonly onBackdropClick = (): void => {
        MobileHaptics.fire(MobileHaptics.LIGHT);
        void this.dismissMobileSideSheets();
    };

    protected readonly onLeftEdgeTouchStart = (e: TouchEvent): void => {
        this.leftEdgeTouchStartX = e.changedTouches[0]?.clientX ?? 0;
    };

    protected readonly onLeftEdgeTouchEnd = (e: TouchEvent): void => {
        const x = e.changedTouches[0]?.clientX ?? 0;
        if (x - this.leftEdgeTouchStartX > 40) {
            MobileHaptics.fire(MobileHaptics.MEDIUM);
            void this.shell.leftPanelHandler.expand();
        }
    };

    protected readonly onRightEdgeTouchStart = (e: TouchEvent): void => {
        this.rightEdgeTouchStartX = e.changedTouches[0]?.clientX ?? 0;
    };

    protected readonly onRightEdgeTouchEnd = (e: TouchEvent): void => {
        const x = e.changedTouches[0]?.clientX ?? 0;
        if (this.rightEdgeTouchStartX - x > 40) {
            MobileHaptics.fire(MobileHaptics.MEDIUM);
            void this.shell.rightPanelHandler.expand();
        }
    };

    /**
     * Floating close button rendered into `document.body` and visible whenever any side sheet is
     * expanded. Positioned at the top-trailing corner of the viewport (CSS) so it aligns with the
     * full-height sheet; the activity strip reserves `--theia-mobile-sheet-close-reserve` so icons
     * are not covered. A single instance handles both sides — tapping collapses whichever sheet is
     * currently open (left, right, or both).
     */
    protected ensureCloseButton(): void {
        if (this.closeButton?.isConnected) {
            this.updateCloseButtonVisibility();
            return;
        }
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'theia-mobile-sheet-close-btn';
        button.setAttribute('aria-label', nls.localize('theia/core/mobileSheetClose', 'Close panel'));
        const icon = document.createElement('span');
        icon.className = 'theia-mobile-sheet-close-btn-icon codicon codicon-close';
        icon.setAttribute('aria-hidden', 'true');
        button.appendChild(icon);
        button.addEventListener('click', this.onCloseButtonClick);
        document.body.appendChild(button);
        this.closeButton = button;
        this.updateCloseButtonVisibility();
    }

    protected removeCloseButton(): void {
        if (this.closeButton) {
            this.closeButton.removeEventListener('click', this.onCloseButtonClick);
            this.closeButton.parentElement?.removeChild(this.closeButton);
            this.closeButton = undefined;
        }
    }

    protected updateCloseButtonVisibility(): void {
        if (!this.closeButton) {
            return;
        }
        const anySide = this.isAnyMobileSideSheetVisible();
        this.closeButton.classList.toggle('theia-mod-visible', anySide);
        this.closeButton.setAttribute('aria-hidden', anySide ? 'false' : 'true');
        // Tab-focus only when visible so the button doesn't end up in the focus order while hidden.
        this.closeButton.tabIndex = anySide ? 0 : -1;
    }

    protected readonly onCloseButtonClick = (): void => {
        MobileHaptics.fire(MobileHaptics.MEDIUM);
        void this.dismissMobileSideSheets();
    };

    protected async dismissMobileSideSheets(): Promise<void> {
        await this.collapseMobileSideSheets();
        this.updateCloseButtonVisibility();
        this.updateBackdropVisibility();
        if (this.mobileActive) {
            this.scheduleSnapAndUiRefresh();
        }
    }

    protected scheduleSnapAndUiRefresh(): void {
        if (!this.mobileActive) {
            return;
        }
        if (this.snapRaf) {
            cancelAnimationFrame(this.snapRaf);
        }
        this.snapRaf = requestAnimationFrame(() => {
            this.snapRaf = 0;
            const snap = (): void => {
                this.snapCenterFullWidth();
                this.updateMobileShellStateClasses();
                this.refreshBottomBar();
                this.updateBackdropVisibility();
                this.requestSheetRelayout();
            };
            void Promise.all([
                this.shell.leftPanelHandler.state.pendingUpdate,
                this.shell.rightPanelHandler.state.pendingUpdate,
                this.getBottomPanelPendingUpdate(),
            ]).then(snap, snap);
        });
    }

    /**
     * Reset the scroll position of any virtualised list inside the side panel container so the user
     * always lands on the top of the view when they re-open a sheet or switch tabs. Targets:
     * `react-virtuoso` scrollers (file tree, search results, SCM, etc.) plus generic `.ps`
     * (perfect-scrollbar) containers used by Theia views.
     */
    protected resetSheetScroll(side: 'left' | 'right'): void {
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

    protected snapCenterFullWidth(): void {
        if (!this.mobileActive) {
            return;
        }
        this.forceCenterColumnFullWidth();
        this.requestSheetRelayout();
    }

    protected requestSheetRelayout(): void {
        if (!this.mobileActive || typeof window === 'undefined') {
            return;
        }
        requestAnimationFrame(() => {
            if (!this.mobileActive) {
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

    /**
     * Force Lumino's `BoxLayout` to discard its cached sizes and re-measure from the host's
     * `clientWidth`/`clientHeight`. This is required because the sheet container is taken out of
     * the SplitLayout flow via `position: fixed` in CSS and expanded to full viewport width, while
     * Lumino still thinks it has the narrow split allocation.
     */
    protected relayoutSheetTree(widget: LuminoWidget): void {
        MessageLoop.sendMessage(widget, LuminoWidget.ResizeMessage.UnknownSize);
        MessageLoop.postMessage(widget, LuminoWidget.Msg.FitRequest);
        MessageLoop.postMessage(widget, LuminoWidget.Msg.UpdateRequest);
        if (widget instanceof Panel) {
            for (const child of toArray(widget.widgets)) {
                this.relayoutSheetTree(child);
            }
        }
    }

    protected relayoutMobileSidePanelHandler(side: 'left' | 'right'): void {
        const handler = side === 'left' ? this.shell.leftPanelHandler : this.shell.rightPanelHandler;
        if (handler instanceof QaapSidePanelHandler) {
            handler.relayoutForMobileSheet();
        } else {
            this.relayoutSheetTree(handler.container);
        }
    }

    protected updateBackdropVisibility(): void {
        const anySide = this.isAnyMobileSideSheetVisible();
        this.removeBackdrop();
        this.updateCloseButtonVisibility();
        if (anySide) {
            window.requestAnimationFrame(() => {
                this.requestSheetRelayout();
                if (this.shell.isExpanded('left')) {
                    this.relayoutMobileSidePanelHandler('left');
                }
                if (this.shell.isExpanded('right')) {
                    this.relayoutMobileSidePanelHandler('right');
                }
            });
        }
    }

    /** Primary mobile views; Projects first (multi-workspace hub), then agent-first actions. */
    protected getMobileBottomButtons(): MobileBottomButton[] {
        return [
            { id: 'projects', label: nls.localize('qaap/mobileBottomBar/projects', 'Projects'), icon: 'codicon-project' },
            { id: 'agent', label: nls.localize('theia/core/mobileBottomBar/agent', 'Agent'), icon: 'codicon-sparkle', commandId: WORKBENCH_AI_CHAT_TOGGLE },
            { id: 'preview', label: nls.localize('theia/core/mobileBottomBar/preview', 'Preview'), icon: 'codicon-play', commandId: MINI_BROWSER_OPEN_URL },
            { id: 'plan', label: nls.localize('theia/core/mobileBottomBar/plan', 'Plan'), icon: 'codicon-checklist' },
            { id: 'pr', label: nls.localize('qaap/mobileBottomBar/pr', 'PR'), icon: 'codicon-git-pull-request' },
            { id: 'diff', label: nls.localize('theia/core/mobileBottomBar/diff', 'Diff'), icon: 'codicon-diff', commandId: WORKBENCH_OPEN_DIFF },
            { id: 'tasks', label: nls.localize('theia/core/mobileBottomBar/tasks', 'Tasks'), icon: 'codicon-list-tree', commandId: WORKBENCH_TASKS_RUN },
            { id: 'skills', label: nls.localize('theia/core/mobileBottomBar/skills', 'Skills'), icon: 'codicon-extensions' },
            { id: 'terminal', label: nls.localize('theia/core/mobileBottomBar/terminal', 'Terminal'), icon: 'codicon-terminal' },
        ];
    }

    protected isMobileBottomButtonActive(id: MobileBottomButtonId): boolean {
        switch (id) {
            case 'projects':
                return !!this.projectsPanel?.isVisible();
            case 'pr':
                return !!this.pullRequestPanel?.isVisible();
            case 'agent':
                return this.isMobileAgentSheetVisible();
            case 'preview':
                return !!this.getActivePreviewWidget();
            case 'terminal':
                return this.isTerminalBottomPanelOpen();
            default:
                return false;
        }
    }

    protected canToggleTerminalBottomPanel(): boolean {
        if (this.isTerminalBottomPanelOpen()) {
            return true;
        }
        const toggleBottom = CommonCommands.TOGGLE_BOTTOM_PANEL.id;
        if (this.commands.getCommand(toggleBottom) && this.commands.isEnabled(toggleBottom)) {
            return true;
        }
        return !!(this.commands.getCommand(WORKBENCH_TOGGLE_TERMINAL) && this.commands.isEnabled(WORKBENCH_TOGGLE_TERMINAL));
    }

    /** Show or hide the bottom terminal panel (same behavior as the workbench top-bar terminal control). */
    protected async toggleTerminalBottomPanel(): Promise<void> {
        if (this.isTerminalBottomPanelOpen()) {
            await this.shell.collapsePanel('bottom');
            this.scheduleSnapAndUiRefresh();
            return;
        }
        const toggleBottom = CommonCommands.TOGGLE_BOTTOM_PANEL.id;
        if (this.commands.getCommand(toggleBottom) && this.commands.isEnabled(toggleBottom)) {
            try {
                await this.commands.executeCommand(toggleBottom);
            } catch (e) {
                console.error(`[qaap-mobile-shell] bottom bar command failed: ${toggleBottom}`, e);
            }
        } else if (this.commands.getCommand(WORKBENCH_TOGGLE_TERMINAL) && this.commands.isEnabled(WORKBENCH_TOGGLE_TERMINAL)) {
            try {
                await this.commands.executeCommand(WORKBENCH_TOGGLE_TERMINAL);
            } catch (e) {
                console.error(`[qaap-mobile-shell] bottom bar command failed: ${WORKBENCH_TOGGLE_TERMINAL}`, e);
            }
        }
        this.scheduleSnapAndUiRefresh();
    }

    protected refreshBottomBar(): void {
        if (!this.bottomBar || !this.mobileActive) {
            return;
        }
        this.bottomBar.replaceChildren();
        for (const def of this.getMobileBottomButtons()) {
            this.bottomBar.appendChild(this.createMobileBottomButton(def));
        }
    }

    protected createMobileBottomButton(def: MobileBottomButton): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'theia-mobile-bottom-activity-btn';
        btn.dataset.actionId = def.id;
        btn.title = def.label;
        const icon = document.createElement('span');
        icon.className = `theia-mobile-bottom-activity-icon codicon ${def.icon}`;
        icon.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.className = 'theia-mobile-bottom-activity-label';
        label.textContent = def.id === 'projects' && this.projectsCount > 0
            ? `${def.label} ${this.projectsCount}`
            : def.label;
        btn.append(icon, label);
        if (def.id === 'terminal') {
            if (!this.canToggleTerminalBottomPanel()) {
                btn.classList.add('theia-mod-unavailable');
            }
        } else {
            const commandId = def.commandId;
            if (commandId && !this.commands.getCommand(commandId)) {
                btn.classList.add('theia-mod-unavailable');
            }
        }
        if (this.isMobileBottomButtonActive(def.id)) {
            btn.classList.add('theia-mod-active');
            btn.setAttribute('aria-pressed', 'true');
        } else {
            btn.setAttribute('aria-pressed', 'false');
        }
        btn.addEventListener('click', () => { void this.onMobileBottomButtonClick(def); });
        return btn;
    }

    protected async onMobileBottomButtonClick(def: MobileBottomButton): Promise<void> {
        MobileHaptics.fire(MobileHaptics.LIGHT);
        if (def.id === 'projects') {
            await this.toggleProjectsPanel();
            return;
        }
        if (def.id === 'pr') {
            await this.togglePullRequestPanel();
            return;
        }
        if (def.id === 'terminal') {
            this.hideProjectsPanel();
            this.hidePullRequestPanel();
            await this.collapseMobileSidePanels();
            await this.toggleTerminalBottomPanel();
            await this.collapseMobileSidePanels();
            this.settleMobileSidePanelsCollapsed();
            return;
        }
        if (def.id === 'agent') {
            this.hidePullRequestPanel();
            await this.toggleMobileAgentSheet();
            return;
        }
        if (def.id === 'preview') {
            this.hidePullRequestPanel();
            await this.toggleMobilePreview();
            return;
        }
        if (def.id === 'plan') {
            this.hidePullRequestPanel();
            await this.openMobileSideSheet('left', EXPLORER_VIEW_CONTAINER_ID);
            this.scheduleSnapAndUiRefresh();
            return;
        }
        if (def.id === 'skills') {
            this.hidePullRequestPanel();
            await this.openMobileSideSheet('left', VSX_EXTENSIONS_VIEW_CONTAINER_ID);
            this.scheduleSnapAndUiRefresh();
            return;
        }
        this.hideProjectsPanel();
        this.hidePullRequestPanel();
        // Main-area actions: collapse side sheets first so preview / quick input are visible.
        if (this.shouldDismissSheetsForButton(def.id)) {
            await this.dismissSheetsAsync();
        }
        const commandId = def.commandId;
        if (commandId && this.commands.getCommand(commandId) && this.commands.isEnabled(commandId)) {
            try {
                await this.commands.executeCommand(commandId);
            } catch (e) {
                console.error(`[qaap-mobile-shell] bottom bar command failed: ${commandId}`, e);
            }
            this.scheduleSnapAndUiRefresh();
        }
    }

    protected async toggleMobileAgentSheet(): Promise<void> {
        this.hideProjectsPanel();
        this.hidePullRequestPanel();
        if (this.isMobileAgentSheetVisible()) {
            await this.collapseMobileSidePanels();
            this.scheduleSnapAndUiRefresh();
            return;
        }
        await this.openMobileSideSheet('right', WORKBENCH_CHAT_VIEW_WIDGET_ID);
        this.scheduleSnapAndUiRefresh();
    }

    protected isMobileAgentSheetVisible(): boolean {
        return this.shell.isExpanded('right') && !this.isSidePanelSheetCollapsedInDom('right');
    }

    protected getActivePreviewWidget(): LuminoWidget | undefined {
        const active = this.shell.activeWidget ?? this.shell.currentWidget;
        if (active?.id.startsWith('mini-browser:') && this.shell.getAreaFor(active) === 'main') {
            return active;
        }
        return undefined;
    }

    protected async toggleMobilePreview(): Promise<void> {
        this.hideProjectsPanel();
        this.hidePullRequestPanel();
        const activePreview = this.getActivePreviewWidget();
        if (activePreview) {
            activePreview.close();
            this.scheduleSnapAndUiRefresh();
            return;
        }
        if (this.shouldDismissSheetsForButton('preview')) {
            await this.dismissSheetsAsync();
        }
        const commandId = MINI_BROWSER_OPEN_URL;
        if (this.commands.getCommand(commandId) && this.commands.isEnabled(commandId)) {
            try {
                await this.commands.executeCommand(commandId);
            } catch (e) {
                console.error(`[qaap-mobile-shell] bottom bar command failed: ${commandId}`, e);
            }
            this.scheduleSnapAndUiRefresh();
        }
    }

    /**
     * Open a side sheet and show a view without `toggle` semantics (which would collapse an
     * already-active panel — the usual failure mode for Agent on mobile).
     */
    protected async openMobileSideSheet(side: 'left' | 'right', widgetId: string): Promise<void> {
        const other: 'left' | 'right' = side === 'left' ? 'right' : 'left';
        this.hideProjectsPanel();
        this.hidePullRequestPanel();
        if (this.shell.isExpanded(other)) {
            await this.shell.collapsePanel(other);
        }
        try {
            const widget = await this.widgetManager.getOrCreateWidget(widgetId);
            const area = widget.isAttached ? this.shell.getAreaFor(widget) : undefined;
            if (!widget.isAttached || area !== side) {
                await this.shell.addWidget(widget, { area: side });
            }
            await this.shell.activateWidget(widgetId);
            if (!this.shell.isExpanded(side)) {
                this.shell.expandPanel(side);
            }
            const handler = side === 'left' ? this.shell.leftPanelHandler : this.shell.rightPanelHandler;
            await handler.state.pendingUpdate;
            this.relayoutMobileSidePanelHandler(side);
            this.resetSheetScroll(side);
        } catch (e) {
            console.error(`[qaap-mobile-shell] openMobileSideSheet(${side}, ${widgetId})`, e);
        }
    }

    protected shouldDismissSheetsForButton(id: MobileBottomButtonId): boolean {
        // Agent lives in the right-side panel by design, so keep that sheet open. Projects uses its
        // own overlay. All other actions target the main editor area, the bottom panel, or a global
        // prompt; the side sheets must be closed so the result is visible.
        return id !== 'agent' && id !== 'projects' && id !== 'pr';
    }

    /** Collapse expanded side sheets and await layout so follow-up UI (e.g. quick input) is stable. */
    protected async dismissSheetsAsync(): Promise<void> {
        await this.dismissMobileSideSheets();
    }

    /** Collapse side + bottom overlays so the main editor column is visible on mobile. */
    protected async collapseMobileSideSheets(): Promise<void> {
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

    protected async collapseMobileSidePanels(): Promise<void> {
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
        this.updateCloseButtonVisibility();
        this.updateBackdropVisibility();
    }

    protected settleMobileSidePanelsCollapsed(): void {
        window.requestAnimationFrame(() => {
            void this.collapseMobileSidePanels();
            window.setTimeout(() => { void this.collapseMobileSidePanels(); }, 150);
        });
    }

    protected markMobileSidePanelCollapsed(side: 'left' | 'right'): void {
        if (!this.mobileActive || this.shell.isExpanded(side)) {
            return;
        }
        const id = side === 'left' ? 'theia-left-content-panel' : 'theia-right-content-panel';
        const panel = document.getElementById(id);
        panel?.classList.add('theia-mod-collapsed', 'lm-mod-hidden');
    }

    protected isSidePanelSheetCollapsedInDom(side: 'left' | 'right'): boolean {
        const id = side === 'left' ? 'theia-left-content-panel' : 'theia-right-content-panel';
        const panel = document.getElementById(id);
        return !panel
            || panel.classList.contains('theia-mod-collapsed')
            || panel.classList.contains('lm-mod-hidden');
    }

    protected isAnyMobileSideSheetVisible(): boolean {
        const leftOpen = this.shell.isExpanded('left') && !this.isSidePanelSheetCollapsedInDom('left');
        const rightOpen = this.shell.isExpanded('right') && !this.isSidePanelSheetCollapsedInDom('right');
        return leftOpen || rightOpen;
    }

    /** Open Welcome when the main dock is empty (layout restore / mobile entry often skip startup). */
    protected async ensureWelcomeInMainArea(): Promise<void> {
        if (toArray(this.shell.mainPanel.widgets()).length > 0) {
            return;
        }
        if (!this.commands.getCommand(GETTING_STARTED_WIDGET_COMMAND)
            || !this.commands.isEnabled(GETTING_STARTED_WIDGET_COMMAND)) {
            return;
        }
        try {
            await this.commands.executeCommand(GETTING_STARTED_WIDGET_COMMAND);
        } catch (e) {
            console.error('[qaap-mobile-shell] failed to open Welcome', e);
        }
    }

}
