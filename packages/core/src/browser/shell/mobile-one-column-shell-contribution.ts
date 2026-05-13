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

import { inject, injectable } from 'inversify';
import { ArrayExt } from '@lumino/algorithm';
import { MessageLoop } from '@lumino/messaging';
import { BoxLayout, BoxPanel, Widget as LuminoWidget } from '@lumino/widgets';
import { Disposable, DisposableCollection } from '../../common/disposable';
import { CommandRegistry } from '../../common/command';
import { nls } from '../../common/nls';
import { FrontendApplication } from '../frontend-application';
import { FrontendApplicationContribution } from '../frontend-application-contribution';
import { ApplicationShell } from './application-shell';
import { MobileHaptics } from './mobile-haptics';
import { MobileKeyboardHelper } from './mobile-keyboard-helper';

class MobileBottomBarWidget extends LuminoWidget {
    constructor() {
        const node = document.createElement('nav');
        node.className = 'theia-mobile-bottom-activity-bar';
        node.setAttribute('role', 'navigation');
        super({ node });
        this.id = 'theia-mobile-bottom-bar';
    }
}

/** Matches {@link packages/core/src/browser/style/mobile-workbench.css} breakpoint. */
const MOBILE_MEDIA = '(max-width: 767px)';

/** Commands referenced for active-state and click-through; declared as strings so `@theia/core` stays free of
 *  optional dependencies (`@theia/ai-chat-ui`, `@theia/terminal`, `@theia/mini-browser`, …). */
const WORKBENCH_AI_CHAT_TOGGLE = 'aiChat:toggle';
const WORKBENCH_CHAT_VIEW_WIDGET_ID = 'chat-view-widget';
const WORKBENCH_TOGGLE_TERMINAL = 'workbench.action.terminal.toggleTerminal';
const WORKBENCH_TASKS_RUN = 'workbench.action.tasks.runTask';
const WORKBENCH_FOCUS_EDITOR = 'workbench.action.focusActiveEditorGroup';
const WORKBENCH_OPEN_DIFF = 'editor.action.diffReview.next';
const MINI_BROWSER_OPEN_URL = 'mini-browser.openUrl';

type MobileBottomButtonId = 'agent' | 'preview' | 'plan' | 'diff' | 'tasks' | 'skills' | 'terminal' | 'editor';

interface MobileBottomButton {
    id: MobileBottomButtonId;
    label: string;
    icon: string;
    commandId?: string;
}

/**
 * Narrow-viewport workbench: full-width editor, side panels as sheets, bottom activity strip,
 * edge swipes and backdrop; compact main tabs (current only) plus “all editors” when available.
 */
@injectable()
export class MobileOneColumnShellContribution implements FrontendApplicationContribution {

    static readonly MOBILE_LAYOUT_CLASS = 'theia-mod-mobile-one-column';

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    protected readonly toDispose = new DisposableCollection();
    protected readonly mobileMq: MediaQueryList | undefined =
        typeof window !== 'undefined' ? window.matchMedia(MOBILE_MEDIA) : undefined;

    protected backdrop: HTMLElement | undefined;
    protected bottomBarWidget: MobileBottomBarWidget | undefined;
    protected get bottomBar(): HTMLElement | undefined { return this.bottomBarWidget?.node; }
    protected leftEdge: HTMLElement | undefined;
    protected rightEdge: HTMLElement | undefined;
    protected closeButton: HTMLButtonElement | undefined;
    protected keyboardHelper: MobileKeyboardHelper | undefined;
    protected savedSplitSizes: number[] | undefined;
    protected mobileActive = false;
    protected snapRaf = 0;
    protected shellHooked = false;

    protected leftEdgeTouchStartX = 0;
    protected rightEdgeTouchStartX = 0;

    onStart(_app: FrontendApplication): void {
        this.mobileMq?.addEventListener('change', this.onMediaChange);
    }

    onDidInitializeLayout(app: FrontendApplication): void {
        this.ensureShellHooks(app.shell);
        this.onMediaChange();
    }

    onStop(_app: FrontendApplication): void {
        this.mobileMq?.removeEventListener('change', this.onMediaChange);
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
        try {
            this.savedSplitSizes = this.shell.leftRightSplitPanel.relativeSizes();
        } catch {
            this.savedSplitSizes = undefined;
        }
        this.shell.node.classList.add(MobileOneColumnShellContribution.MOBILE_LAYOUT_CLASS);
        this.ensureOverlayElements();
        this.scheduleSnapAndUiRefresh();
    }

    protected leaveMobileLayout(): void {
        if (!this.mobileActive) {
            return;
        }
        this.mobileActive = false;
        this.shell.node.classList.remove(MobileOneColumnShellContribution.MOBILE_LAYOUT_CLASS);
        this.teardownMobileUi();
        if (this.savedSplitSizes && this.savedSplitSizes.length === 3) {
            try {
                this.shell.leftRightSplitPanel.setRelativeSizes(this.savedSplitSizes);
            } catch {
                /* ignore */
            }
        }
        this.savedSplitSizes = undefined;
    }

    protected teardownMobileUi(): void {
        if (this.backdrop?.parentElement) {
            this.backdrop.removeEventListener('click', this.onBackdropClick);
            this.backdrop.parentElement.removeChild(this.backdrop);
        }
        this.backdrop = undefined;
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
    }

    protected ensureOverlayElements(): void {
        if (!this.mobileActive) {
            return;
        }
        if (!this.backdrop) {
            this.backdrop = document.createElement('div');
            this.backdrop.className = 'theia-mobile-sheet-backdrop';
            this.backdrop.setAttribute('aria-hidden', 'true');
            this.backdrop.addEventListener('click', this.onBackdropClick);
            document.body.appendChild(this.backdrop);
        }
        if (!this.bottomBarWidget) {
            this.bottomBarWidget = new MobileBottomBarWidget();
            this.bottomBarWidget.node.setAttribute(
                'aria-label',
                nls.localize('theia/core/mobileBottomBar', 'Primary views')
            );
        }
        this.attachBottomBarToShell();
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
        this.refreshBottomBar();
        this.updateBackdropVisibility();
    }

    protected attachBottomBarToShell(): void {
        const widget = this.bottomBarWidget;
        if (!widget) {
            return;
        }
        const layout = this.shell.layout as BoxLayout | null;
        if (!layout || !(layout instanceof BoxLayout)) {
            return;
        }
        if (widget.parent === this.shell) {
            return;
        }
        const statusBarIndex = ArrayExt.findFirstIndex(
            layout.widgets as ReadonlyArray<LuminoWidget>,
            w => w.id === 'theia-statusBar'
        );
        BoxPanel.setStretch(widget, 0);
        if (statusBarIndex >= 0) {
            layout.insertWidget(statusBarIndex, widget);
        } else {
            layout.addWidget(widget);
        }
    }

    protected detachBottomBarFromShell(): void {
        const widget = this.bottomBarWidget;
        if (!widget) {
            return;
        }
        if (widget.parent) {
            widget.parent = null;
        }
        widget.dispose();
        this.bottomBarWidget = undefined;
    }

    protected readonly onBackdropClick = (): void => {
        MobileHaptics.fire(MobileHaptics.LIGHT);
        void this.shell.collapsePanel('left');
        void this.shell.collapsePanel('right');
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
     * expanded. Sits in the safe-area/menubar strip above the sheet so it does not overlap the
     * activity strip icons; horizontally centered. A single instance handles both sides — tapping
     * collapses whichever sheet is currently open (left, right, or both).
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
        const anySide = this.shell.isExpanded('left') || this.shell.isExpanded('right');
        this.closeButton.classList.toggle('theia-mod-visible', anySide);
        this.closeButton.setAttribute('aria-hidden', anySide ? 'false' : 'true');
        // Tab-focus only when visible so the button doesn't end up in the focus order while hidden.
        this.closeButton.tabIndex = anySide ? 0 : -1;
    }

    protected readonly onCloseButtonClick = (): void => {
        MobileHaptics.fire(MobileHaptics.MEDIUM);
        if (this.shell.isExpanded('left')) {
            void this.shell.collapsePanel('left');
        }
        if (this.shell.isExpanded('right')) {
            void this.shell.collapsePanel('right');
        }
    };

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
                this.refreshBottomBar();
                this.updateBackdropVisibility();
                this.resetSheetScroll('left');
                this.resetSheetScroll('right');
            };
            void Promise.all([
                this.shell.leftPanelHandler.state.pendingUpdate,
                this.shell.rightPanelHandler.state.pendingUpdate,
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
        try {
            this.shell.leftRightSplitPanel.setRelativeSizes([0, 1, 0]);
        } catch {
            /* layout not ready */
        }
        // The sheet panels are taken out of split flow via `position: fixed` and forced to 100vw via CSS.
        // Lumino still lays out their children using `clientWidth`/`clientHeight` of the sheet container,
        // so we trigger a resize so the BoxLayout inside the sheet picks up the new width.
        this.requestSheetRelayout();
    }

    protected requestSheetRelayout(): void {
        if (!this.mobileActive || typeof window === 'undefined') {
            return;
        }
        // Defer one frame so the CSS rules promoting the sheet to `position: fixed; width: 100vw`
        // have been applied to the DOM before Lumino re-measures `clientWidth`.
        requestAnimationFrame(() => {
            if (!this.mobileActive) {
                return;
            }
            this.relayoutSheetTree(this.shell.leftPanelHandler.container);
            this.relayoutSheetTree(this.shell.rightPanelHandler.container);
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
    }

    protected updateBackdropVisibility(): void {
        if (!this.backdrop) {
            return;
        }
        const anySide = this.shell.isExpanded('left') || this.shell.isExpanded('right');
        this.backdrop.classList.toggle('theia-mod-visible', anySide);
        this.backdrop.setAttribute('aria-hidden', anySide ? 'false' : 'true');
        this.updateCloseButtonVisibility();
    }

    /** Fixed agent-first actions for the mobile bottom bar. Mirrors the prototype in the design spec. */
    protected getMobileBottomButtons(): MobileBottomButton[] {
        return [
            { id: 'agent', label: nls.localize('theia/core/mobileBottomBar/agent', 'Agent'), icon: 'codicon-sparkle', commandId: WORKBENCH_AI_CHAT_TOGGLE },
            { id: 'preview', label: nls.localize('theia/core/mobileBottomBar/preview', 'Preview'), icon: 'codicon-play', commandId: MINI_BROWSER_OPEN_URL },
            { id: 'plan', label: nls.localize('theia/core/mobileBottomBar/plan', 'Plan'), icon: 'codicon-checklist' },
            { id: 'diff', label: nls.localize('theia/core/mobileBottomBar/diff', 'Diff'), icon: 'codicon-diff', commandId: WORKBENCH_OPEN_DIFF },
            { id: 'tasks', label: nls.localize('theia/core/mobileBottomBar/tasks', 'Tasks'), icon: 'codicon-list-tree', commandId: WORKBENCH_TASKS_RUN },
            { id: 'skills', label: nls.localize('theia/core/mobileBottomBar/skills', 'Skills'), icon: 'codicon-extensions' },
            { id: 'terminal', label: nls.localize('theia/core/mobileBottomBar/terminal', 'Terminal'), icon: 'codicon-terminal', commandId: WORKBENCH_TOGGLE_TERMINAL },
            { id: 'editor', label: nls.localize('theia/core/mobileBottomBar/editor', 'Editor'), icon: 'codicon-code', commandId: WORKBENCH_FOCUS_EDITOR },
        ];
    }

    protected isMobileBottomButtonActive(id: MobileBottomButtonId): boolean {
        switch (id) {
            case 'agent': {
                const title = this.shell.rightPanelHandler.tabBar.currentTitle;
                return this.shell.isExpanded('right') && title?.owner?.id === WORKBENCH_CHAT_VIEW_WIDGET_ID;
            }
            case 'preview': {
                const active = this.shell.activeWidget ?? this.shell.currentWidget;
                return !!active && active.id.startsWith('mini-browser:') && this.shell.getAreaFor(active) === 'main';
            }
            case 'terminal':
                return this.shell.isExpanded('bottom') && !this.shell.bottomPanel.isEmpty;
            case 'editor': {
                const active = this.shell.activeWidget;
                if (!active || this.shell.getAreaFor(active) !== 'main') {
                    return false;
                }
                return !active.id.startsWith('mini-browser:');
            }
            default:
                return false;
        }
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
        label.textContent = def.label;
        btn.append(icon, label);
        const commandId = def.commandId;
        if (commandId && !this.commands.getCommand(commandId)) {
            btn.classList.add('theia-mod-unavailable');
        }
        if (this.isMobileBottomButtonActive(def.id)) {
            btn.classList.add('theia-mod-active');
            btn.setAttribute('aria-pressed', 'true');
        } else {
            btn.setAttribute('aria-pressed', 'false');
        }
        btn.addEventListener('click', () => this.onMobileBottomButtonClick(def));
        return btn;
    }

    protected onMobileBottomButtonClick(def: MobileBottomButton): void {
        MobileHaptics.fire(MobileHaptics.LIGHT);
        // The side panels render as full-bleed sheets on mobile (`position: fixed; width: 100vw`).
        // If one is open when the user picks an action that targets the main editor area, the sheet
        // would visually cover the resulting widget (e.g. the mini-browser preview). Collapse them
        // first so the new widget is unobstructed. Actions that explicitly open a side panel via
        // the side activity bar bypass this contribution.
        if (this.shouldDismissSheetsForButton(def.id)) {
            this.dismissSheets();
        }
        const commandId = def.commandId;
        if (commandId && this.commands.getCommand(commandId) && this.commands.isEnabled(commandId)) {
            void this.commands.executeCommand(commandId).catch(() => undefined);
            this.scheduleSnapAndUiRefresh();
        }
    }

    protected shouldDismissSheetsForButton(id: MobileBottomButtonId): boolean {
        // Agent lives in the right-side panel by design, so keep that sheet open. All other actions
        // target the main editor area, the bottom panel, or a global prompt; the side sheets must
        // be closed so the result is visible.
        return id !== 'agent';
    }

    protected dismissSheets(): void {
        if (this.shell.isExpanded('left')) {
            void this.shell.collapsePanel('left');
        }
        if (this.shell.isExpanded('right')) {
            void this.shell.collapsePanel('right');
        }
    }

}