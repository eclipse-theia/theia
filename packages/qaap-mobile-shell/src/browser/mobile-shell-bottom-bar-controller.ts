// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ArrayExt } from '@lumino/algorithm';
import { MessageLoop } from '@lumino/messaging';
import { BoxLayout, BoxPanel, SplitPanel, Widget as LuminoWidget } from '@lumino/widgets';
import { ApplicationShell, MAXIMIZED_CLASS } from '@theia/core/lib/browser/shell/application-shell';
import { StatusBarImpl } from '@theia/core/lib/browser/status-bar/status-bar';
import { CommonCommands } from '@theia/core/lib/browser/common-commands';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { nls } from '@theia/core/lib/common/nls';
import { MobileHaptics } from './mobile-haptics';
import { installMobileHorizontalTouchScroll } from './mobile-horizontal-touch-scroll';
import {
    peekPreferDesktopIde,
    setMobileLandingHubListChrome,
    setMobileWorkHubComposerHeaderChrome,
    setMobileWorkHubHideBottomChrome,
} from './mobile-projects-open';
import type { MobileProjectEntry, MobileProjectsHubView } from './mobile-projects-types';
import type { MobileProjectsPanel } from './mobile-projects-panel';
import type { MobileProjectsService } from './mobile-projects-service';
import { MobileSnackbar } from './mobile-snackbar';
import { dismissQaapAccountMenu } from './qaap-workbench-account-menu';
import type { QaapProjectBootstrapService } from './qaap-project-bootstrap-service';
import {
    BottomBarSecondaryItem,
    EDIT_CHAT_SESSION_SETTINGS_COMMAND,
    MOBILE_BOTTOM_OPEN_CLASS,
    MOBILE_BOTTOM_SPLIT_DEFAULT_BOTTOM_RATIO,
    MOBILE_BOTTOM_SPLIT_MAIN_MIN_RATIO,
    MobileBottomBarWidget,
    MobileBottomButton,
    MobileBottomButtonId,
    OPEN_AI_CONFIGURATION_COMMAND,
    ShellWithMaximizedOverlay,
    WORKBENCH_AI_CHAT_TOGGLE,
    WORKBENCH_TOGGLE_TERMINAL,
} from './mobile-shell-bottom-bar-widget';

export interface MobileShellBottomBarHost {
    isMobileActive(): boolean;
    getLandingLeftThisSession(): boolean;
    getProjectsCount(): number;
    getProjectsPanel(): MobileProjectsPanel | undefined;
    isMobileWorkHubLandingVisible(): boolean;
    isPullRequestPanelShown(): boolean;
    isMobileAgentSheetVisible(): boolean;
    isMobileExploreSheetVisible(): boolean;
    getActivePreviewWidget(): LuminoWidget | undefined;
    isSidePanelSheetCollapsedInDom(side: 'left' | 'right'): boolean;
    scheduleSnapAndUiRefresh(): void;
    refreshWorkbenchTopBar(): void;
    hideProjectsPanel(): void;
    hidePullRequestPanel(): void;
    toggleProjectsPanel(): Promise<void>;
    togglePullRequestPanel(): Promise<void>;
    openMobileWorkHubLanding(view: MobileProjectsHubView): Promise<void>;
    collapseMobileSidePanels(): Promise<void>;
    dismissSheetsAsync(): Promise<void>;
    settleMobileSidePanelsCollapsed(): void;
    onProjectsPanelOpen(project: MobileProjectEntry): Promise<void>;
    refreshProjectsCount(): Promise<void>;
    toggleMobileAgentSheet(): Promise<void>;
    toggleMobilePreview(): Promise<void>;
    toggleMobileExploreSheet(): Promise<void>;
    openPullRequestPanel(): void;
    executeAndDismiss(commandId: string): Promise<void>;
    relayoutMainPreviewWidgets(): void;
    conversationsStart(): void;
    inboxStreamStart(): void;
}

export interface MobileShellBottomBarControllerOptions {
    host: MobileShellBottomBarHost;
    shell: ApplicationShell;
    statusBar: StatusBarImpl;
    commands: CommandRegistry;
    projectsService: MobileProjectsService;
    projectBootstrap: QaapProjectBootstrapService;
    mobileMq?: MediaQueryList;
}

/**
 * Mobile bottom activity bar, status chrome pinning, terminal split/maximize, and secondary action sheets.
 */
export class MobileShellBottomBarController {

    suppressMobileBottomAutoMaximize = false;

    protected bottomChromeHost: HTMLElement | undefined;
    protected bottomChromeTouchScrollDispose = Disposable.NULL;
    protected statusBarShellIndex = -1;
    protected bottomBarWidget: MobileBottomBarWidget | undefined;
    protected bottomBarMenuCleanup: (() => void) | undefined;

    protected readonly host: MobileShellBottomBarHost;
    protected readonly shell: ApplicationShell;
    protected readonly statusBar: StatusBarImpl;
    protected readonly commands: CommandRegistry;
    protected readonly projectsService: MobileProjectsService;
    protected readonly projectBootstrap: QaapProjectBootstrapService;
    protected readonly mobileMq: MediaQueryList | undefined;

    constructor(options: MobileShellBottomBarControllerOptions) {
        this.host = options.host;
        this.shell = options.shell;
        this.statusBar = options.statusBar;
        this.commands = options.commands;
        this.projectsService = options.projectsService;
        this.projectBootstrap = options.projectBootstrap;
        this.mobileMq = options.mobileMq;
    }

    getBottomBarNode(): HTMLElement | undefined {
        return this.bottomBarWidget?.node;
    }

    /** Bottom panel is visible with at least one widget (matches Projects “open” semantics for the bar). */
    isTerminalBottomPanelOpen(): boolean {
        return this.isMobileBottomTerminalVisible();
    }

    /** Bottom terminal area is shown (may still be mid expand animation). */
    isMobileBottomTerminalVisible(): boolean {
        const bottom = this.shell.bottomPanel;
        return !bottom.isHidden && !bottom.isEmpty;
    }

    getBottomPanelPendingUpdate(): Promise<void> {
        const state = (this.shell as ApplicationShell & { bottomPanelState?: { pendingUpdate: Promise<void> } }).bottomPanelState;
        return state?.pendingUpdate ?? Promise.resolve();
    }

    getBottomAreaSplitPanel(): SplitPanel | undefined {
        const parent = this.shell.mainPanel.parent;
        return parent instanceof SplitPanel ? parent : undefined;
    }

    /** Measured height of the bottom dock inside `#theia-bottom-split-panel` (px). */
    measureMobileBottomPanelHeightPx(): number | undefined {
        const parent = this.shell.bottomPanel.parent;
        if (!(parent instanceof SplitPanel) || !parent.isVisible) {
            return undefined;
        }
        const index = parent.widgets.indexOf(this.shell.bottomPanel) - 1;
        if (index < 0) {
            return undefined;
        }
        const handle = parent.handles[index];
        if (handle.classList.contains('lm-mod-hidden')) {
            return undefined;
        }
        const parentHeight = parent.node.clientHeight;
        if (parentHeight <= 0) {
            return undefined;
        }
        return parentHeight - handle.offsetTop;
    }

    /**
     * Main/bottom ratios for the center-column split. Never collapses main to 0 — that pushed
     * mini-browser toolbars and `#theia-top-panel` off-screen when resizing the inspector sash.
     */
    resolveMobileBottomSplitSizes(): [number, number] {
        const split = this.getBottomAreaSplitPanel();
        const total = split?.node.clientHeight ?? 0;
        if (total <= 0) {
            const bottom = MOBILE_BOTTOM_SPLIT_DEFAULT_BOTTOM_RATIO;
            return [1 - bottom, bottom];
        }
        let bottomPx = this.measureMobileBottomPanelHeightPx();
        if (!bottomPx || bottomPx <= 0) {
            const state = (this.shell as ApplicationShell & { bottomPanelState?: { lastPanelSize?: number } }).bottomPanelState;
            bottomPx = state?.lastPanelSize ?? Math.round(total * MOBILE_BOTTOM_SPLIT_DEFAULT_BOTTOM_RATIO);
        }
        const minBottomPx = 120;
        const maxBottomPx = Math.round(total * (1 - MOBILE_BOTTOM_SPLIT_MAIN_MIN_RATIO));
        bottomPx = Math.max(minBottomPx, Math.min(maxBottomPx, bottomPx));
        const mainPx = Math.max(Math.round(total * MOBILE_BOTTOM_SPLIT_MAIN_MIN_RATIO), total - bottomPx);
        const adjustedBottomPx = total - mainPx;
        return [mainPx / total, adjustedBottomPx / total];
    }

    /** Vertical split between main editor and bottom panel inside the center column. */
    syncMobileBottomSplit(): void {
        if (this.shell.bottomPanel.hasClass(MAXIMIZED_CLASS)) {
            return;
        }
        const split = this.getBottomAreaSplitPanel();
        if (!split) {
            return;
        }
        try {
            if (this.shell.isExpanded('bottom')) {
                const current = split.relativeSizes();
                if (current.length >= 2 && current[0] >= MOBILE_BOTTOM_SPLIT_MAIN_MIN_RATIO) {
                    return;
                }
                const [main, bottom] = this.resolveMobileBottomSplitSizes();
                split.setRelativeSizes([main, bottom]);
            } else {
                split.setRelativeSizes([1, 0]);
            }
        } catch {
            /* layout not ready */
        }
    }

    /**
     * Mobile default: same as the panel "maximize" chevron — detach the bottom dock into the shell
     * overlay so the terminal fills the workspace above the bottom activity bar.
     */
    async applyMobileBottomPanelMaximizedSize(): Promise<void> {
        if (!this.host.isMobileActive() || this.suppressMobileBottomAutoMaximize) {
            return;
        }
        await this.getBottomPanelPendingUpdate();
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const bottomPanel = this.shell.bottomPanel;
        if (!this.isMobileBottomTerminalVisible() || bottomPanel.hasClass(MAXIMIZED_CLASS)) {
            return;
        }
        bottomPanel.toggleMaximized();
        this.syncMobileMaximizedOverlayInsets();
    }

    restoreMobileBottomPanelFromMaximized(): void {
        const bottomPanel = this.shell.bottomPanel;
        if (bottomPanel.hasClass(MAXIMIZED_CLASS)) {
            bottomPanel.toggleMaximized();
        }
        this.clearMobileMaximizedOverlayInsets();
    }

    getMaximizedOverlayElement(): HTMLElement | undefined {
        return (this.shell as unknown as ShellWithMaximizedOverlay).maximizedElement;
    }

    /** Keep the maximized terminal above the pinned mobile bottom chrome (activity bar + status). */
    syncMobileMaximizedOverlayInsets(): void {
        const overlay = this.getMaximizedOverlayElement();
        if (!overlay || !this.host.isMobileActive()) {
            return;
        }
        if (!this.shell.bottomPanel.hasClass(MAXIMIZED_CLASS)) {
            this.clearMobileMaximizedOverlayInsets();
            return;
        }
        const topRect = this.shell.topPanel.node.getBoundingClientRect();
        overlay.style.top = `${topRect.bottom}px`;
        overlay.style.bottom = [
            'calc(',
            'var(--theia-mobile-bottom-bar-height, 56px)',
            '+ var(--theia-mobile-status-chrome-height, 34px)',
            '+ var(--theia-mobile-keyboard-inset, 0px)',
            '+ env(safe-area-inset-bottom, 0px)',
            ')',
        ].join(' ');
    }

    clearMobileMaximizedOverlayInsets(): void {
        const overlay = this.getMaximizedOverlayElement();
        overlay?.style.removeProperty('bottom');
        overlay?.style.removeProperty('top');
    }

    updateMobileShellStateClasses(): void {
        this.shell.node.classList.toggle(MOBILE_BOTTOM_OPEN_CLASS, this.shell.isExpanded('bottom'));
    }

    /**
     * Bottom activity strip + status bar live on `document.body` in mobile mode so Lumino layout
     * metrics and shell height cannot leave a gap under the status track.
     */
    ensureBottomChromeHost(): HTMLElement {
        if (!this.bottomChromeHost) {
            const host = document.createElement('div');
            host.className = 'theia-mobile-bottom-chrome-host';
            host.setAttribute('aria-hidden', 'false');
            document.body.appendChild(host);
            this.bottomChromeHost = host;
        }
        return this.bottomChromeHost;
    }

    ensureBottomBarWidget(): MobileBottomBarWidget {
        if (!this.bottomBarWidget) {
            this.bottomBarWidget = new MobileBottomBarWidget();
            this.bottomBarWidget.node.setAttribute(
                'aria-label',
                nls.localize('theia/core/mobileBottomBar', 'Primary views')
            );
        }
        return this.bottomBarWidget;
    }

    pinBottomChromeToBody(): void {
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

    installBottomChromeTouchScroll(): void {
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

    unpinBottomChromeFromBody(): void {
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

    detachBottomBarFromShell(): void {
        const widget = this.bottomBarWidget;
        if (!widget) {
            return;
        }
        if (widget.parent) {
            widget.parent = null;
        }
        this.bottomBarWidget = undefined;
    }

    isWorkHubLandingBottomBar(): boolean {
        if (!this.host.isMobileActive() || peekPreferDesktopIde()) {
            return false;
        }
        if (document.body.classList.contains('theia-mobile-mod-workhub-composer-header')
            || document.body.classList.contains('theia-mobile-mod-active-transcript')) {
            return true;
        }
        const panel = this.host.getProjectsPanel();
        if (panel?.isVisible() && panel.isHomeMode() && panel.getHubView() === 'tasks'
            && (panel.isAgentsHubShellActive() || panel.node.classList.contains('theia-mod-agents-hub-landing'))) {
            return true;
        }
        const onLandingPanel = document.body.classList.contains('theia-mobile-mod-landing')
            && panel?.isHomeMode() === true
            && panel.isVisible();
        if (onLandingPanel) {
            return true;
        }
        return this.isMobileWorkspaceHubPrimaryBottomBar();
    }

    /** Chat vacío en el área principal: misma barra Home · Agents · Routines que en el landing. */
    isMobileWorkspaceHubPrimaryBottomBar(): boolean {
        return this.host.getLandingLeftThisSession()
            && !document.body.classList.contains('theia-mobile-mod-landing')
            && this.isMainAgentSurfaceEmpty();
    }

    isMainAgentSurfaceEmpty(): boolean {
        const shell = this.shell.node;
        if (shell.querySelector('.theia-mobile-agent-transcript-empty')) {
            return true;
        }
        const transcript = shell.querySelector(
            '.theia-mobile-agent-transcript-root.theia-mod-visible .theia-mobile-agent-transcript',
        );
        if (transcript && transcript.querySelector('.theia-mobile-agent-transcript-msg') === null) {
            return transcript.querySelector('.theia-mobile-agent-transcript-empty') !== null;
        }
        return false;
    }

    syncMobileHubPrimaryBottomChrome(): void {
        if (peekPreferDesktopIde()) {
            setMobileWorkHubHideBottomChrome(false);
            setMobileWorkHubComposerHeaderChrome(false);
            if (this.bottomChromeHost) {
                this.bottomChromeHost.setAttribute('aria-hidden', 'false');
            }
            return;
        }
        const hideBottomChrome = this.isWorkHubLandingBottomBar();
        setMobileWorkHubHideBottomChrome(hideBottomChrome);
        if (hideBottomChrome) {
            setMobileLandingHubListChrome(false);
        }
        if (this.bottomChromeHost) {
            this.bottomChromeHost.setAttribute('aria-hidden', hideBottomChrome ? 'true' : 'false');
        }
    }

    /** Icon-only hub tabs (reference mock) while the project list is visible. */
    /** Agents is the default shell; overview and routines live in the sessions sidebar. */
    getWorkHubLandingBottomButtons(): MobileBottomButton[] {
        return [
            {
                id: 'hub-tasks',
                label: nls.localize('qaap/mobileBottomBar/hubAgents', 'Agents'),
                icon: 'codicon-sparkle',
            },
        ];
    }

    /** Primary workspace views. Projects is isolated in the top-bar return action. */
    getMobileBottomButtons(): MobileBottomButton[] {
        if (this.isWorkHubLandingBottomBar()) {
            return this.getWorkHubLandingBottomButtons();
        }
        return [
            { id: 'agent', label: nls.localize('theia/core/mobileBottomBar/agent', 'Agent'), icon: 'codicon-sparkle', commandId: WORKBENCH_AI_CHAT_TOGGLE },
            { id: 'preview', label: nls.localize('theia/core/mobileBottomBar/preview', 'Preview'), icon: 'codicon-play' },
            { id: 'terminal', label: nls.localize('theia/core/mobileBottomBar/terminal', 'Terminal'), icon: 'codicon-terminal' },
            { id: 'explore', label: nls.localize('qaap/mobileBottomBar/explore', 'Explore'), icon: 'codicon-folder-opened' },
            { id: 'pr', label: nls.localize('qaap/mobileBottomBar/pr', 'PR'), icon: 'codicon-git-pull-request' },
        ];
    }

    isMobileBottomButtonActive(id: MobileBottomButtonId): boolean {
        if (!this.host.isMobileWorkHubLandingVisible()) {
            switch (id) {
                case 'hub-home':
                case 'hub-inbox':
                case 'hub-projects':
                case 'hub-tasks':
                case 'hub-review':
                case 'hub-team':
                case 'hub-automations':
                    return false;
                default:
                    break;
            }
        }
        switch (id) {
            case 'hub-home':
                return this.host.isMobileWorkHubLandingVisible()
                    && this.host.getProjectsPanel()?.getHubView() === 'home';
            case 'hub-inbox':
                return this.host.isMobileWorkHubLandingVisible()
                    && this.host.getProjectsPanel()?.getHubView() === 'review';
            case 'hub-projects':
                return this.host.isMobileWorkHubLandingVisible()
                    && this.host.getProjectsPanel()?.getHubView() === 'repos'
                    && !this.host.getProjectsPanel()?.isProjectDetailView();
            case 'hub-tasks':
                if (this.host.isMobileWorkHubLandingVisible()) {
                    return this.host.getProjectsPanel()?.getHubView() === 'tasks';
                }
                return this.isMobileWorkspaceHubPrimaryBottomBar() && this.isMainAgentSurfaceEmpty();
            case 'hub-review':
                return this.host.isMobileWorkHubLandingVisible()
                    && this.host.getProjectsPanel()?.getHubView() === 'review';
            case 'hub-team':
                return this.host.isMobileWorkHubLandingVisible()
                    && this.host.getProjectsPanel()?.getHubView() === 'tasks';
            case 'hub-automations':
                return this.host.isMobileWorkHubLandingVisible()
                    && this.host.getProjectsPanel()?.getHubView() === 'routines';
            case 'projects':
                return !!this.host.getProjectsPanel()?.isVisible();
            case 'pr':
                return this.host.isPullRequestPanelShown();
            case 'agent':
                return this.host.isMobileAgentSheetVisible();
            case 'preview':
                return !!this.host.getActivePreviewWidget();
            case 'explore':
                return this.host.isMobileExploreSheetVisible();
            case 'terminal':
                return this.isTerminalBottomPanelOpen();
            default:
                return false;
        }
    }

    canToggleTerminalBottomPanel(): boolean {
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
    async toggleTerminalBottomPanel(): Promise<void> {
        if (this.isTerminalBottomPanelOpen()) {
            if (this.shell.bottomPanel.hasClass(MAXIMIZED_CLASS)) {
                this.suppressMobileBottomAutoMaximize = false;
                this.restoreMobileBottomPanelFromMaximized();
                await this.shell.collapsePanel('bottom');
                this.host.scheduleSnapAndUiRefresh();
                return;
            }
            this.suppressMobileBottomAutoMaximize = false;
            await this.applyMobileBottomPanelMaximizedSize();
            this.host.scheduleSnapAndUiRefresh();
            return;
        }
        this.suppressMobileBottomAutoMaximize = false;
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
        await this.applyMobileBottomPanelMaximizedSize();
        this.host.scheduleSnapAndUiRefresh();
    }

    refreshBottomBar(): void {
        const bottomBar = this.getBottomBarNode();
        if (!bottomBar || !this.host.isMobileActive()) {
            return;
        }
        this.syncMobileHubPrimaryBottomChrome();
        dismissQaapAccountMenu();
        bottomBar.replaceChildren();
        if (this.isWorkHubLandingBottomBar()) {
            return;
        }
        for (const def of this.getMobileBottomButtons()) {
            bottomBar.appendChild(this.createMobileBottomButton(def));
        }
    }

    createMobileBottomButton(def: MobileBottomButton): HTMLButtonElement {
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
        label.textContent = def.id === 'projects' && this.host.getProjectsCount() > 0
            ? `${def.label} ${this.host.getProjectsCount()}`
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
        const isHubLandingTab = def.id === 'hub-tasks';
        let hubTabNavAt = 0;
        const onHubTabActivate = (): void => {
            const now = Date.now();
            if (now - hubTabNavAt < 320) {
                return;
            }
            hubTabNavAt = now;
            void this.onMobileBottomButtonClick(def, btn);
        };
        if (isHubLandingTab) {
            // Sin long-press: en iOS el click sintético a veces se pierde tras touchend del menú secundario.
            btn.addEventListener('pointerup', event => {
                if (event.pointerType === 'mouse' && event.button !== 0) {
                    return;
                }
                event.preventDefault();
                event.stopPropagation();
                onHubTabActivate();
            });
            btn.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                onHubTabActivate();
            });
        } else {
            btn.addEventListener('click', event => {
                event.stopPropagation();
                void this.onMobileBottomButtonClick(def, btn);
            });
            this.installBottomBarLongPress(btn, def);
        }
        return btn;
    }

    /**
     * Touch long-press on a bottom-bar button surfaces a secondary action sheet
     * (e.g. "New terminal", "Refresh projects"). Pointer chains: a long-press
     * raises the menu and we swallow the subsequent `click` so the primary
     * action does not also fire.
     */
    installBottomBarLongPress(btn: HTMLButtonElement, def: MobileBottomButton): void {
        let timer: number | undefined;
        let startX = 0;
        let startY = 0;
        let fired = false;
        const LONG_PRESS_MS = 480;
        const MOVE_THRESHOLD = 12;
        const cancel = (): void => {
            if (timer !== undefined) {
                window.clearTimeout(timer);
                timer = undefined;
            }
        };
        btn.addEventListener('touchstart', ev => {
            if (ev.touches.length !== 1) {
                cancel();
                return;
            }
            const touch = ev.touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
            fired = false;
            cancel();
            timer = window.setTimeout(() => {
                timer = undefined;
                fired = true;
                MobileHaptics.fire(MobileHaptics.MEDIUM);
                void this.showBottomBarSecondaryMenu(btn, def);
            }, LONG_PRESS_MS);
        }, { passive: true });
        btn.addEventListener('touchmove', ev => {
            if (timer === undefined) {
                return;
            }
            const touch = ev.touches[0];
            if (!touch) {
                cancel();
                return;
            }
            if (Math.abs(touch.clientX - startX) > MOVE_THRESHOLD
                || Math.abs(touch.clientY - startY) > MOVE_THRESHOLD) {
                cancel();
            }
        }, { passive: true });
        btn.addEventListener('touchend', ev => {
            cancel();
            if (fired && ev.cancelable) {
                ev.preventDefault();
            }
        });
        btn.addEventListener('touchcancel', () => cancel(), { passive: true });
        btn.addEventListener('click', ev => {
            if (fired) {
                ev.preventDefault();
                ev.stopImmediatePropagation();
                fired = false;
            }
        }, true);
    }

    async showBottomBarSecondaryMenu(anchor: HTMLElement, def: MobileBottomButton): Promise<void> {
        const items = await this.getBottomBarSecondaryItems(def);
        if (items.length === 0) {
            MobileSnackbar.show(def.label, { duration: 800 });
            return;
        }
        this.removeBottomBarSecondaryMenu();
        const menu = document.createElement('div');
        menu.className = 'theia-mobile-bottom-actionsheet';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', def.label);
        for (const item of items) {
            const itemBtn = document.createElement('button');
            itemBtn.type = 'button';
            itemBtn.className = 'theia-mobile-bottom-actionsheet-item';
            itemBtn.setAttribute('role', 'menuitem');
            if (item.icon) {
                const ic = document.createElement('span');
                ic.className = `codicon ${item.icon}`;
                ic.setAttribute('aria-hidden', 'true');
                itemBtn.appendChild(ic);
            }
            const lbl = document.createElement('span');
            lbl.className = 'theia-mobile-bottom-actionsheet-label';
            lbl.textContent = item.label;
            itemBtn.appendChild(lbl);
            if (item.detail) {
                const det = document.createElement('span');
                det.className = 'theia-mobile-bottom-actionsheet-detail';
                det.textContent = item.detail;
                itemBtn.appendChild(det);
            }
            itemBtn.addEventListener('click', () => {
                this.removeBottomBarSecondaryMenu();
                MobileHaptics.fire(MobileHaptics.LIGHT);
                void item.run();
            });
            menu.appendChild(itemBtn);
        }
        document.body.appendChild(menu);
        const rect = anchor.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        let left = rect.left + rect.width / 2 - menuRect.width / 2;
        const minLeft = 8;
        const maxLeft = window.innerWidth - menuRect.width - 8;
        if (left < minLeft) { left = minLeft; }
        if (left > maxLeft) { left = maxLeft; }
        menu.style.left = `${Math.round(left)}px`;
        menu.style.bottom = `calc(${Math.round(window.innerHeight - rect.top + 8)}px)`;
        menu.classList.add('theia-mod-visible');

        const onDocPointer = (ev: PointerEvent): void => {
            if (menu.contains(ev.target as Node)) {
                return;
            }
            this.removeBottomBarSecondaryMenu();
        };
        document.addEventListener('pointerdown', onDocPointer, { capture: true, once: false });
        this.bottomBarMenuCleanup = () => {
            document.removeEventListener('pointerdown', onDocPointer, true);
        };
    }

    removeBottomBarSecondaryMenu(): void {
        const existing = document.querySelector('.theia-mobile-bottom-actionsheet');
        existing?.parentElement?.removeChild(existing);
        this.bottomBarMenuCleanup?.();
        this.bottomBarMenuCleanup = undefined;
    }

    async getBottomBarSecondaryItems(def: MobileBottomButton): Promise<BottomBarSecondaryItem[]> {
        if (def.id === 'hub-home' || def.id === 'hub-projects' || def.id === 'hub-tasks' || def.id === 'hub-review' || def.id === 'hub-team' || def.id === 'hub-automations') {
            return [];
        }
        switch (def.id) {
            case 'projects':
                return this.getProjectsSecondaryItems();
            case 'terminal':
                return this.getTerminalSecondaryItems();
            case 'agent':
                return this.getAgentSecondaryItems();
            case 'pr':
                return this.getPullRequestSecondaryItems();
            case 'preview':
                return this.getPreviewSecondaryItems();
            case 'explore':
                return this.getExploreSecondaryItems();
            default:
                return [];
        }
    }

    async getProjectsSecondaryItems(): Promise<BottomBarSecondaryItem[]> {
        const items: BottomBarSecondaryItem[] = [];
        let projects: MobileProjectEntry[] = [];
        try {
            projects = await this.projectsService.loadProjects();
        } catch {
            projects = [];
        }
        const switchable = projects.filter(p => !p.isCurrent).slice(0, 4);
        for (const project of switchable) {
            items.push({
                label: project.name,
                detail: project.github?.fullName ?? project.branch,
                icon: 'codicon-repo',
                run: () => this.host.onProjectsPanelOpen(project),
            });
        }
        if (items.length > 0) {
            items.push({
                label: nls.localize('qaap/mobileBottomBar/projectsAll', 'All projects'),
                icon: 'codicon-list-unordered',
                run: () => this.host.toggleProjectsPanel(),
            });
        }
        items.push({
            label: nls.localize('qaap/mobileBottomBar/projectsRefresh', 'Refresh'),
            icon: 'codicon-refresh',
            run: async () => {
                await this.host.refreshProjectsCount();
                this.refreshBottomBar();
                MobileSnackbar.show(
                    nls.localize('qaap/mobileBottomBar/projectsRefreshed', 'Work Hub refreshed'),
                    { kind: 'success', duration: 1200 }
                );
            },
        });
        return items;
    }

    getTerminalSecondaryItems(): BottomBarSecondaryItem[] {
        const items: BottomBarSecondaryItem[] = [];
        const newTerminal = 'terminal:new';
        if (this.commands.getCommand(newTerminal)) {
            items.push({
                label: nls.localize('qaap/mobileBottomBar/newTerminal', 'New terminal'),
                icon: 'codicon-add',
                run: () => this.host.executeAndDismiss(newTerminal),
            });
        }
        const killAll = 'terminal:kill-all';
        if (this.commands.getCommand(killAll)) {
            items.push({
                label: nls.localize('qaap/mobileBottomBar/closeAllTerminals', 'Close all terminals'),
                icon: 'codicon-trash',
                run: () => this.host.executeAndDismiss(killAll),
            });
        }
        if (this.isTerminalBottomPanelOpen()) {
            items.push({
                label: nls.localize('qaap/mobileBottomBar/collapseTerminal', 'Collapse panel'),
                icon: 'codicon-chevron-down',
                run: async () => { await this.shell.collapsePanel('bottom'); this.host.scheduleSnapAndUiRefresh(); },
            });
        }
        return items;
    }

    getAgentSecondaryItems(): BottomBarSecondaryItem[] {
        const items: BottomBarSecondaryItem[] = [];
        if (this.commands.getCommand(EDIT_CHAT_SESSION_SETTINGS_COMMAND)) {
            items.push({
                label: nls.localize('qaap/mobileBottomBar/agentSettings', 'Session settings'),
                icon: 'codicon-settings',
                run: () => this.host.executeAndDismiss(EDIT_CHAT_SESSION_SETTINGS_COMMAND),
            });
        }
        if (this.commands.getCommand(OPEN_AI_CONFIGURATION_COMMAND)) {
            items.push({
                label: nls.localize('qaap/mobileBottomBar/agentConfig', 'AI configuration'),
                icon: 'codicon-extensions',
                run: () => this.host.executeAndDismiss(OPEN_AI_CONFIGURATION_COMMAND),
            });
        }
        return items;
    }

    getPullRequestSecondaryItems(): BottomBarSecondaryItem[] {
        return [{
            label: nls.localize('qaap/mobileBottomBar/prRefresh', 'Refresh pull requests'),
            icon: 'codicon-refresh',
            run: async () => {
                this.host.hideProjectsPanel();
                this.host.openPullRequestPanel();
                this.refreshBottomBar();
            },
        }];
    }

    getPreviewSecondaryItems(): BottomBarSecondaryItem[] {
        const items: BottomBarSecondaryItem[] = [];
        const descriptor = this.projectBootstrap.descriptor;
        const phase = this.projectBootstrap.phase;
        if (descriptor) {
            if (phase === 'detected') {
                items.push({
                    label: nls.localize('qaap/mobileBottomBar/previewInstall', 'Install dependencies'),
                    detail: descriptor.installCommand,
                    icon: 'codicon-cloud-download',
                    run: () => this.projectBootstrap.runInstall(),
                });
            }
            if (descriptor.devCommand && (phase === 'ready-to-run' || phase === 'detected' || phase === 'run-failed')) {
                items.push({
                    label: nls.localize('qaap/mobileBottomBar/previewRunDev', 'Run dev server'),
                    detail: descriptor.devCommandLabel ?? descriptor.devCommand,
                    icon: 'codicon-play',
                    run: () => this.projectBootstrap.runDevServer(),
                });
            }
            if (phase === 'dismissed') {
                items.push({
                    label: nls.localize('qaap/mobileBottomBar/previewShowBanner', 'Show project setup'),
                    icon: 'codicon-rocket',
                    run: () => this.projectBootstrap.reset(),
                });
            }
            if (this.projectBootstrap.previewUrl) {
                items.push({
                    label: nls.localize('qaap/mobileBottomBar/previewFocus', 'Open dev preview'),
                    detail: this.projectBootstrap.previewUrl,
                    icon: 'codicon-link-external',
                    run: () => this.projectBootstrap.focusPreview(),
                });
            }
        }
        const reload = 'mini-browser.reload';
        if (this.commands.getCommand(reload)) {
            items.push({
                label: nls.localize('qaap/mobileBottomBar/previewReload', 'Reload preview'),
                icon: 'codicon-refresh',
                run: () => this.host.executeAndDismiss(reload),
            });
        }
        return items;
    }

    getExploreSecondaryItems(): BottomBarSecondaryItem[] {
        const items: BottomBarSecondaryItem[] = [];
        const newFile = 'file.newFile';
        if (this.commands.getCommand(newFile)) {
            items.push({
                label: nls.localize('qaap/mobileBottomBar/newFile', 'New file'),
                icon: 'codicon-new-file',
                run: () => this.host.executeAndDismiss(newFile),
            });
        }
        const newFolder = 'file.newFolder';
        if (this.commands.getCommand(newFolder)) {
            items.push({
                label: nls.localize('qaap/mobileBottomBar/newFolder', 'New folder'),
                icon: 'codicon-new-folder',
                run: () => this.host.executeAndDismiss(newFolder),
            });
        }
        return items;
    }

    shouldDismissSheetsForButton(id: MobileBottomButtonId): boolean {
        // Agent lives in the right-side panel by design, so keep that sheet open. Projects uses its
        // own overlay. All other actions target the main editor area, the bottom panel, or a global
        // prompt; the side sheets must be closed so the result is visible.
        return id !== 'agent' && id !== 'projects' && id !== 'pr';
    }

    async onMobileBottomButtonClick(def: MobileBottomButton, btn: HTMLButtonElement): Promise<void> {
        MobileHaptics.fire(MobileHaptics.LIGHT);
        if (def.id === 'hub-tasks') {
            btn.blur();
        }
        if (def.id === 'hub-inbox') {
            dismissQaapAccountMenu();
            await this.host.openMobileWorkHubLanding('review');
            this.host.conversationsStart();
            this.host.inboxStreamStart();
            return;
        }
        if (def.id === 'hub-projects') {
            await this.host.openMobileWorkHubLanding('repos');
            return;
        }
        if (def.id === 'hub-tasks') {
            await this.host.openMobileWorkHubLanding('tasks');
            return;
        }
        if (def.id === 'hub-review') {
            dismissQaapAccountMenu();
            await this.host.openMobileWorkHubLanding('review');
            this.host.conversationsStart();
            this.host.inboxStreamStart();
            return;
        }
        if (def.id === 'hub-team') {
            await this.host.openMobileWorkHubLanding('tasks');
            return;
        }
        if (def.id === 'projects') {
            await this.host.toggleProjectsPanel();
            return;
        }
        if (def.id === 'pr') {
            await this.host.togglePullRequestPanel();
            return;
        }
        if (def.id === 'terminal') {
            this.host.hideProjectsPanel();
            this.host.hidePullRequestPanel();
            await this.host.collapseMobileSidePanels();
            await this.toggleTerminalBottomPanel();
            await this.host.collapseMobileSidePanels();
            this.host.settleMobileSidePanelsCollapsed();
            return;
        }
        if (def.id === 'agent') {
            this.host.hidePullRequestPanel();
            await this.host.toggleMobileAgentSheet();
            return;
        }
        if (def.id === 'preview') {
            this.host.hidePullRequestPanel();
            await this.host.toggleMobilePreview();
            return;
        }
        if (def.id === 'explore') {
            this.host.hidePullRequestPanel();
            await this.host.toggleMobileExploreSheet();
            return;
        }
        this.host.hideProjectsPanel();
        this.host.hidePullRequestPanel();
        // Main-area actions: collapse side sheets first so preview / quick input are visible.
        if (this.shouldDismissSheetsForButton(def.id)) {
            await this.host.dismissSheetsAsync();
        }
        const commandId = def.commandId;
        if (commandId && this.commands.getCommand(commandId) && this.commands.isEnabled(commandId)) {
            try {
                await this.commands.executeCommand(commandId);
            } catch (e) {
                console.error(`[qaap-mobile-shell] bottom bar command failed: ${commandId}`, e);
            }
            this.host.relayoutMainPreviewWidgets();
            this.host.scheduleSnapAndUiRefresh();
        }
    }
}
