// *****************************************************************************
// Copyright (C) 2026 theia-ide and others.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { nls } from '@theia/core/lib/common/nls';
import { MOBILE_NARROW_VIEWPORT_MEDIA_QUERY } from '@theia/core/lib/browser/shell/mobile-layout-state';
import { MobileHaptics } from './mobile-haptics';

/** Plugin-registered command IDs (see `plugin-vscode-commands-contribution.ts`). */
const QUICK_OPEN_COMMAND = 'workbench.action.quickOpen';
const COMMAND_PALETTE_COMMAND = 'workbench.action.showCommands';

/**
 * Floating action button anchored to the bottom-right of the editor area on
 * mobile. Tapping the FAB opens Quick Open (file picker), long-press opens the
 * Command Palette. The button hides itself when:
 *   - mobile layout is not active,
 *   - the soft keyboard is visible (the keyboard accessory bar already covers
 *     the same vertical real estate),
 *   - a mobile sheet (Projects, PR, side sheet) is open (those expose their own
 *     primary actions),
 *   - or no editor / main area widget is active.
 *
 * Why a FAB? Quick Open is the single most-used IDE command on small screens —
 * scrolling the file tree to switch files takes far more taps than typing two
 * letters. A persistent affordance shortcuts that path without re-introducing
 * the desktop activity bar.
 */
@injectable()
export class MobileQuickActionsFabContribution implements FrontendApplicationContribution {

    protected static readonly LONG_PRESS_MS = 480;
    protected static readonly MOVE_THRESHOLD = 12;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    protected fab: HTMLButtonElement | undefined;
    protected mobileMq: MediaQueryList | undefined;
    protected toDispose = new DisposableCollection();
    protected lastTapAt = 0;
    protected longPressTimer: number | undefined;
    protected longPressFired = false;
    protected pressStartX = 0;
    protected pressStartY = 0;

    onStart(): void {
        if (typeof window === 'undefined') {
            return;
        }
        this.mobileMq = window.matchMedia(MOBILE_NARROW_VIEWPORT_MEDIA_QUERY);
        const refresh = (): void => this.refreshVisibility();
        this.mobileMq.addEventListener('change', refresh);
        this.toDispose.push(Disposable.create(() => this.mobileMq?.removeEventListener('change', refresh)));
        this.toDispose.push(this.shell.onDidChangeActiveWidget(refresh));
        this.toDispose.push(this.shell.onDidChangeCurrentWidget(refresh));
        const visibilityObserver = new MutationObserver(refresh);
        visibilityObserver.observe(this.shell.node, { attributes: true, attributeFilter: ['class'] });
        this.toDispose.push(Disposable.create(() => visibilityObserver.disconnect()));
        // Keyboard inset is exposed as a CSS var; observing the body covers all
        // narrow-viewport keyboard transitions without coupling to the helper.
        if (typeof document !== 'undefined') {
            const bodyObserver = new MutationObserver(refresh);
            bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });
            this.toDispose.push(Disposable.create(() => bodyObserver.disconnect()));
        }
        this.refreshVisibility();
    }

    onStop(): void {
        this.toDispose.dispose();
        if (this.longPressTimer !== undefined) {
            window.clearTimeout(this.longPressTimer);
            this.longPressTimer = undefined;
        }
        this.fab?.remove();
        this.fab = undefined;
    }

    protected refreshVisibility(): void {
        const visible = this.computeShouldShow();
        if (!visible) {
            this.fab?.classList.remove('theia-mod-visible');
            return;
        }
        const fab = this.ensureFab();
        if (!fab.classList.contains('theia-mod-visible')) {
            fab.classList.add('theia-mod-visible');
        }
    }

    protected computeShouldShow(): boolean {
        if (!this.mobileMq?.matches) {
            return false;
        }
        if (!this.shell.node.classList.contains('theia-mod-mobile-one-column')) {
            return false;
        }
        if (this.isAnyMobileSheetVisible()) {
            return false;
        }
        if (this.isKeyboardOpen()) {
            return false;
        }
        const main = this.shell.activeWidget ?? this.shell.currentWidget;
        if (!main || this.shell.getAreaFor(main) !== 'main') {
            // Still useful on the Welcome screen, but not when a side panel has focus.
            // Keep it visible when no active widget at all to expose Quick Open early.
            return !main;
        }
        return true;
    }

    protected isAnyMobileSheetVisible(): boolean {
        if (typeof document === 'undefined') {
            return false;
        }
        const projects = document.querySelector('.theia-mobile-projects');
        if (projects?.classList.contains('theia-mod-visible')) {
            return true;
        }
        const pr = document.querySelector('.theia-mobile-pr');
        if (pr?.classList.contains('theia-mod-visible')) {
            return true;
        }
        const left = document.getElementById('theia-left-content-panel');
        if (left && !left.classList.contains('theia-mod-collapsed') && !left.classList.contains('lm-mod-hidden')) {
            return true;
        }
        const right = document.getElementById('theia-right-content-panel');
        if (right && !right.classList.contains('theia-mod-collapsed') && !right.classList.contains('lm-mod-hidden')) {
            return true;
        }
        return false;
    }

    protected isKeyboardOpen(): boolean {
        const cssVar = this.shell.node.style.getPropertyValue('--theia-mobile-keyboard-inset');
        if (cssVar && parseInt(cssVar, 10) > 0) {
            return true;
        }
        if (typeof window === 'undefined' || !window.visualViewport) {
            return false;
        }
        const delta = window.innerHeight - window.visualViewport.height;
        return delta > 100;
    }

    protected ensureFab(): HTMLButtonElement {
        if (this.fab && document.body.contains(this.fab)) {
            return this.fab;
        }
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'theia-mobile-quick-fab';
        btn.setAttribute('aria-label', nls.localize('qaap/mobileFab/quickOpen', 'Quick Open'));
        btn.title = nls.localize('qaap/mobileFab/longPressHint', 'Tap: Quick Open · Long-press: Command Palette');
        const icon = document.createElement('span');
        icon.className = 'codicon codicon-search';
        icon.setAttribute('aria-hidden', 'true');
        btn.append(icon);

        btn.addEventListener('touchstart', ev => this.onTouchStart(ev), { passive: true });
        btn.addEventListener('touchmove', ev => this.onTouchMove(ev), { passive: true });
        btn.addEventListener('touchend', ev => this.onTouchEnd(ev));
        btn.addEventListener('touchcancel', () => this.cancelLongPress(), { passive: true });
        btn.addEventListener('click', ev => this.onClick(ev));

        document.body.appendChild(btn);
        this.fab = btn;
        return btn;
    }

    protected onTouchStart(ev: TouchEvent): void {
        if (ev.touches.length !== 1) {
            this.cancelLongPress();
            return;
        }
        const touch = ev.touches[0];
        this.pressStartX = touch.clientX;
        this.pressStartY = touch.clientY;
        this.longPressFired = false;
        this.cancelLongPress();
        this.longPressTimer = window.setTimeout(() => {
            this.longPressTimer = undefined;
            this.longPressFired = true;
            MobileHaptics.fire(MobileHaptics.MEDIUM);
            void this.executeIfAvailable(COMMAND_PALETTE_COMMAND);
        }, MobileQuickActionsFabContribution.LONG_PRESS_MS);
    }

    protected onTouchMove(ev: TouchEvent): void {
        if (this.longPressTimer === undefined) {
            return;
        }
        const touch = ev.touches[0];
        if (!touch) {
            this.cancelLongPress();
            return;
        }
        if (Math.abs(touch.clientX - this.pressStartX) > MobileQuickActionsFabContribution.MOVE_THRESHOLD
            || Math.abs(touch.clientY - this.pressStartY) > MobileQuickActionsFabContribution.MOVE_THRESHOLD) {
            this.cancelLongPress();
        }
    }

    protected onTouchEnd(ev: TouchEvent): void {
        this.cancelLongPress();
        if (this.longPressFired && ev.cancelable) {
            ev.preventDefault();
        }
    }

    protected onClick(ev: MouseEvent): void {
        if (this.longPressFired) {
            ev.preventDefault();
            ev.stopImmediatePropagation();
            this.longPressFired = false;
            return;
        }
        MobileHaptics.fire(MobileHaptics.LIGHT);
        void this.executeIfAvailable(QUICK_OPEN_COMMAND);
    }

    protected cancelLongPress(): void {
        if (this.longPressTimer !== undefined) {
            window.clearTimeout(this.longPressTimer);
            this.longPressTimer = undefined;
        }
    }

    protected async executeIfAvailable(commandId: string): Promise<void> {
        if (!this.commands.getCommand(commandId)) {
            return;
        }
        try {
            await this.commands.executeCommand(commandId);
        } catch (e) {
            console.error(`[qaap-mobile-shell] FAB action failed: ${commandId}`, e);
        }
    }
}
