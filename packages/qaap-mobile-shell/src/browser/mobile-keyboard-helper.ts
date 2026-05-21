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

import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { nls } from '@theia/core/lib/common/nls';

/**
 * Mobile virtual-keyboard support for the narrow-viewport workbench.
 *
 * Three concerns are handled together because they share lifecycle and DOM listeners:
 *   1. visualViewport tracking: exposes `--theia-mobile-keyboard-inset` (px) on the shell
 *      so the layout can shrink and the bottom activity bar stays above the keyboard.
 *   2. Code accessory bar: floating row of keys (Tab, Esc, arrows, brackets, …) that
 *      appears above the keyboard when a Monaco editor is focused. Native software
 *      keyboards omit these and they are essential for coding on phones.
 *   3. Editor input attributes: forces `inputmode=text`, disables autocapitalize/
 *      autocorrect/spellcheck on Monaco's hidden textarea so iOS does not mangle code.
 *
 * The 16px font hack for `.theia-input` (anti-zoom on iOS focus) is CSS-only and lives
 * in `mobile-workbench.css` — gated by `@supports (-webkit-touch-callout: none)`.
 */
export class MobileKeyboardHelper implements Disposable {

    /**
     * Min keyboard height (px) before we treat the viewport delta as a real keyboard.
     * Browser chrome (URL bar collapse) typically produces deltas under this threshold.
     */
    /** Open when occluded height crosses this (px). */
    protected static readonly KEYBOARD_INSET_OPEN_THRESHOLD_PX = 80;
    /** Close only below this (px) so inset does not flap during keyboard animation. */
    protected static readonly KEYBOARD_INSET_CLOSE_THRESHOLD_PX = 48;

    /** Selector for an editor textarea where the code accessory bar makes sense. */
    protected static readonly EDITOR_INPUT_SELECTOR = '.monaco-editor textarea.inputarea';

    /** xterm's hidden textarea — focus target when typing in the integrated terminal. */
    protected static readonly TERMINAL_INPUT_SELECTOR = '.terminal-container .xterm .xterm-helper-textarea';

    /** Extra scroll room below the last terminal line while the virtual keyboard is open. */
    protected static readonly TERMINAL_SCROLL_PADDING_EXTRA_PX = 32;

    protected readonly toDispose = new DisposableCollection();
    protected readonly shellNode: HTMLElement;

    protected accessory: HTMLElement | undefined;
    protected lastEditorTarget: HTMLTextAreaElement | undefined;
    protected lastTerminalTarget: HTMLTextAreaElement | undefined;
    protected lastInsetPx = 0;
    protected viewportRaf = 0;
    /**
     * Largest seen layout-viewport height while the keyboard is considered closed.
     * When `window.innerHeight` shrinks together with `visualViewport` (Android “resize”
     * behavior), `innerHeight - vv.height - offsetTop` stays ~0; comparing against this
     * baseline recovers the occluded band so `--theia-mobile-keyboard-inset` still applies.
     */
    protected stableLayoutViewportHeight = 0;
    protected keyboardInsetConsideredOpen = false;
    protected focusNudgeHandles: number[] = [];
    protected editableFocusCount = 0;

    constructor(shellNode: HTMLElement) {
        this.shellNode = shellNode;
    }

    install(): void {
        if (typeof window === 'undefined') {
            return;
        }
        this.installViewportTracking();
        this.installFocusTracking();
        this.installEditorAttributeObserver();
    }

    dispose(): void {
        for (const h of this.focusNudgeHandles) {
            window.clearTimeout(h);
        }
        this.focusNudgeHandles.length = 0;
        if (this.viewportRaf) {
            cancelAnimationFrame(this.viewportRaf);
            this.viewportRaf = 0;
        }
        this.removeAccessory();
        // Variable lives on :root so position: fixed nodes appended to document.body
        // (sheet backdrops, accessory bar, edge swipe zones) inherit it.
        document.documentElement.style.removeProperty('--theia-mobile-keyboard-inset');
        document.documentElement.style.removeProperty('--theia-mobile-visual-viewport-height');
        document.documentElement.style.removeProperty('--theia-mobile-terminal-scroll-padding');
        this.shellNode.classList.remove('theia-mod-mobile-keyboard-open');
        this.shellNode.classList.remove('theia-mod-mobile-terminal-keyboard');
        this.lastEditorTarget = undefined;
        this.lastTerminalTarget = undefined;
        this.lastInsetPx = 0;
        this.stableLayoutViewportHeight = 0;
        this.keyboardInsetConsideredOpen = false;
        this.toDispose.dispose();
    }

    // ---------------------------------------------------------------------------
    // visualViewport tracking
    // ---------------------------------------------------------------------------

    protected installViewportTracking(): void {
        const vv = window.visualViewport;
        if (!vv) {
            return;
        }
        const update = (): void => this.scheduleViewportUpdate();
        const onOrientationChange = (): void => {
            // Portrait/landscape changes the layout baseline; keeping an old max would
            // inflate `--theia-mobile-keyboard-inset` after rotation.
            this.stableLayoutViewportHeight = 0;
            update();
        };
        vv.addEventListener('resize', update);
        vv.addEventListener('scroll', update);
        // iOS sometimes only fires geometry changes via window resize.
        window.addEventListener('orientationchange', onOrientationChange);
        window.addEventListener('resize', update);
        this.toDispose.pushAll([
            Disposable.create(() => vv.removeEventListener('resize', update)),
            Disposable.create(() => vv.removeEventListener('scroll', update)),
            Disposable.create(() => window.removeEventListener('orientationchange', onOrientationChange)),
            Disposable.create(() => window.removeEventListener('resize', update)),
        ]);
        this.scheduleViewportUpdate();
    }

    protected scheduleViewportUpdate(): void {
        if (this.viewportRaf) {
            return;
        }
        this.viewportRaf = requestAnimationFrame(() => {
            this.viewportRaf = 0;
            this.applyViewportInset();
        });
    }

    protected applyViewportInset(): void {
        const vv = window.visualViewport;
        if (!vv) {
            return;
        }
        const innerH = window.innerHeight;
        // The keyboard reduces visualViewport.height (and on iOS shifts offsetTop).
        // When the layout viewport stays full (e.g. iOS overlay keyboard), `innerH` is
        // larger than vv.height + offsetTop and this difference is the bottom inset.
        let occluded = Math.max(0, innerH - vv.height - vv.offsetTop);

        const vvExtent = vv.offsetTop + vv.height;
        const layoutViewportGuess = Math.max(innerH, vvExtent);
        if (occluded < MobileKeyboardHelper.KEYBOARD_INSET_OPEN_THRESHOLD_PX) {
            this.stableLayoutViewportHeight = Math.max(
                this.stableLayoutViewportHeight,
                Math.round(layoutViewportGuess)
            );
        }
        if (occluded < MobileKeyboardHelper.KEYBOARD_INSET_OPEN_THRESHOLD_PX && this.stableLayoutViewportHeight > 0) {
            const fromStable = Math.max(
                0,
                this.stableLayoutViewportHeight - vv.height - vv.offsetTop
            );
            if (fromStable >= MobileKeyboardHelper.KEYBOARD_INSET_OPEN_THRESHOLD_PX) {
                occluded = fromStable;
            }
        }

        const inset = this.resolveKeyboardInsetPx(occluded);
        document.documentElement.style.setProperty('--theia-mobile-visual-viewport-height', `${Math.round(vv.height)}px`);
        if (inset === this.lastInsetPx) {
            this.updateAccessoryPosition();
            this.updateTerminalScrollPadding();
            return;
        }
        this.lastInsetPx = inset;
        if (inset > 0) {
            document.documentElement.style.setProperty('--theia-mobile-keyboard-inset', `${inset}px`);
            this.shellNode.classList.add('theia-mod-mobile-keyboard-open');
        } else {
            document.documentElement.style.removeProperty('--theia-mobile-keyboard-inset');
            this.shellNode.classList.remove('theia-mod-mobile-keyboard-open');
            if (this.editableFocusCount <= 0) {
                this.stableLayoutViewportHeight = Math.round(Math.max(innerH, vvExtent));
                this.restoreViewportScroll();
            }
        }
        this.updateAccessoryVisibility();
        this.updateTerminalScrollPadding();
    }

    /** Hysteresis avoids padding/inset toggling while the OS keyboard animates. */
    protected resolveKeyboardInsetPx(occluded: number): number {
        if (this.keyboardInsetConsideredOpen) {
            if (occluded >= MobileKeyboardHelper.KEYBOARD_INSET_CLOSE_THRESHOLD_PX) {
                return Math.round(occluded);
            }
            this.keyboardInsetConsideredOpen = false;
            return 0;
        }
        if (occluded >= MobileKeyboardHelper.KEYBOARD_INSET_OPEN_THRESHOLD_PX) {
            this.keyboardInsetConsideredOpen = true;
            return Math.round(occluded);
        }
        return 0;
    }

    // ---------------------------------------------------------------------------
    // Focus tracking & editor textarea attributes
    // ---------------------------------------------------------------------------

    protected installFocusTracking(): void {
        const onFocusIn = (e: FocusEvent): void => this.onFocusIn(e);
        const onFocusOut = (e: FocusEvent): void => this.onFocusOut(e);
        document.addEventListener('focusin', onFocusIn, true);
        document.addEventListener('focusout', onFocusOut, true);
        this.toDispose.pushAll([
            Disposable.create(() => document.removeEventListener('focusin', onFocusIn, true)),
            Disposable.create(() => document.removeEventListener('focusout', onFocusOut, true)),
        ]);
    }

    protected onFocusIn(e: FocusEvent): void {
        const target = e.target;
        if (this.isEditableForViewportKeyboard(target)) {
            this.editableFocusCount++;
            this.nudgeViewportAfterFocus();
        }
        if (!(target instanceof HTMLTextAreaElement)) {
            return;
        }
        if (target.matches(MobileKeyboardHelper.TERMINAL_INPUT_SELECTOR)) {
            this.lastTerminalTarget = target;
            this.updateTerminalScrollPadding();
            return;
        }
        if (!target.matches(MobileKeyboardHelper.EDITOR_INPUT_SELECTOR)) {
            return;
        }
        this.applyEditorInputAttributes(target);
        this.lastEditorTarget = target;
        this.updateAccessoryVisibility();
    }

    /** Inputs that may show the on-screen keyboard and need a visualViewport refresh. */
    protected isEditableForViewportKeyboard(node: EventTarget | null): boolean {
        if (!(node instanceof HTMLElement)) {
            return false;
        }
        if (node instanceof HTMLTextAreaElement) {
            return true;
        }
        if (node instanceof HTMLSelectElement) {
            return true;
        }
        if (node instanceof HTMLInputElement) {
            const type = node.type;
            if (type === 'button' || type === 'checkbox' || type === 'radio' || type === 'hidden' || type === 'file') {
                return false;
            }
            return true;
        }
        if (node.isContentEditable) {
            return true;
        }
        return Boolean(node.closest('[contenteditable="true"]'));
    }

    /** iOS / Chromium sometimes apply `visualViewport` size a few frames after focus. */
    protected nudgeViewportAfterFocus(): void {
        for (const h of this.focusNudgeHandles) {
            window.clearTimeout(h);
        }
        this.focusNudgeHandles.length = 0;
        this.scheduleViewportUpdate();
        for (const delay of [80, 200, 520]) {
            this.focusNudgeHandles.push(window.setTimeout(() => this.scheduleViewportUpdate(), delay));
        }
    }

    protected onFocusOut(e: FocusEvent): void {
        const target = e.target;
        if (this.isEditableForViewportKeyboard(target)) {
            if (this.shouldRetainQuickInputEditableFocus(e)) {
                this.scheduleViewportUpdate();
            } else {
                this.editableFocusCount = Math.max(0, this.editableFocusCount - 1);
                this.nudgeViewportAfterBlur();
            }
        }
        if (target === this.lastTerminalTarget) {
            const previousTerminal = this.lastTerminalTarget;
            queueMicrotask(() => {
                if (this.lastTerminalTarget === previousTerminal) {
                    this.lastTerminalTarget = undefined;
                    this.updateTerminalScrollPadding();
                }
            });
        }
        if (target !== this.lastEditorTarget) {
            return;
        }
        // Defer one tick: focus may move to another editor textarea (split editors,
        // diff editors), in which case onFocusIn will reset the target immediately.
        const previous = this.lastEditorTarget;
        queueMicrotask(() => {
            if (this.lastEditorTarget === previous) {
                this.lastEditorTarget = undefined;
                this.updateAccessoryVisibility();
            }
        });
    }

    /**
     * Mobile browsers can report one stale visualViewport frame after the keyboard closes.
     * Rechecking a few times prevents QAAP from staying in a shrunken / lifted state.
     */
    protected nudgeViewportAfterBlur(): void {
        this.scheduleViewportUpdate();
        for (const delay of [80, 180, 360, 720]) {
            this.focusNudgeHandles.push(window.setTimeout(() => {
                if (!this.hasEditableFocus()) {
                    this.editableFocusCount = 0;
                }
                this.scheduleViewportUpdate();
            }, delay));
        }
    }

    protected hasEditableFocus(): boolean {
        return this.isEditableForViewportKeyboard(document.activeElement);
    }

    /**
     * Quick Input filter fields lose focus briefly when the OS keyboard animates in.
     * Keep keyboard inset / accessory state until focus returns or the widget closes.
     */
    protected shouldRetainQuickInputEditableFocus(event: FocusEvent): boolean {
        const target = event.target;
        if (!(target instanceof HTMLElement) || !target.closest('#quick-input-container')) {
            return false;
        }
        const related = event.relatedTarget;
        if (related instanceof Node && target.closest('#quick-input-container')?.contains(related)) {
            return true;
        }
        return this.isQuickInputVisible();
    }

    protected isQuickInputVisible(): boolean {
        const container = document.getElementById('quick-input-container');
        if (!container) {
            return false;
        }
        const widget = container.querySelector<HTMLElement>('.quick-input-widget');
        return Boolean(widget && widget.style.display !== 'none');
    }

    protected restoreViewportScroll(): void {
        if (this.isQuickInputVisible()) {
            return;
        }
        if (window.scrollX === 0 && window.scrollY === 0) {
            return;
        }
        window.requestAnimationFrame(() => window.scrollTo(0, 0));
    }

    /**
     * Some Monaco textareas already carry these attributes, but plugins or older
     * Monaco builds occasionally ship without them. Setting them is idempotent.
     */
    protected applyEditorInputAttributes(textarea: HTMLTextAreaElement): void {
        if (textarea.dataset.theiaMobileKeyboardSetup === 'true') {
            return;
        }
        textarea.setAttribute('inputmode', 'text');
        textarea.setAttribute('autocapitalize', 'off');
        textarea.setAttribute('autocorrect', 'off');
        textarea.setAttribute('autocomplete', 'off');
        textarea.setAttribute('spellcheck', 'false');
        textarea.dataset.theiaMobileKeyboardSetup = 'true';
    }

    /**
     * Catches editor textareas that are created while the helper is active but never
     * focused before we want the attributes applied (e.g. preview/peek widgets that
     * create a textarea up-front). Cheap because we only watch additions.
     */
    protected installEditorAttributeObserver(): void {
        if (typeof MutationObserver === 'undefined') {
            return;
        }
        const observer = new MutationObserver(records => {
            for (const record of records) {
                record.addedNodes.forEach(node => {
                    if (!(node instanceof Element)) {
                        return;
                    }
                    if (node instanceof HTMLTextAreaElement
                        && node.matches(MobileKeyboardHelper.EDITOR_INPUT_SELECTOR)) {
                        this.applyEditorInputAttributes(node);
                        return;
                    }
                    node.querySelectorAll?.(MobileKeyboardHelper.EDITOR_INPUT_SELECTOR)
                        .forEach(el => {
                            if (el instanceof HTMLTextAreaElement) {
                                this.applyEditorInputAttributes(el);
                            }
                        });
                });
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        this.toDispose.push(Disposable.create(() => observer.disconnect()));
    }

    // ---------------------------------------------------------------------------
    // Code accessory bar (Tab / Esc / arrows / brackets / …)
    // ---------------------------------------------------------------------------

    /**
     * Three pages of code-accessory keys. Each page is a horizontal row that scrolls
     * inline (native overflow-x), and the user swipes between pages by panning
     * across the bar past the boundary (handled in `installAccessoryPaging`).
     *
     *  - code: the original quick keys (brackets, punctuation, arrows).
     *  - symbols: operators / dollar / template (`=>`, `==`, `!==`, `&&`, …).
     *  - nav: navigation keys + select-line shortcuts (Home/End, PgUp/PgDn).
     *
     * Single chars dispatch `insertText`; named keys synthesize a `KeyboardEvent`.
     */
    protected static readonly ACCESSORY_PAGES: ReadonlyArray<AccessoryPage> = [
        {
            id: 'code',
            keys: [
                { type: 'key', label: 'Tab', key: 'Tab', code: 'Tab', keyCode: 9 },
                { type: 'key', label: 'Esc', key: 'Escape', code: 'Escape', keyCode: 27 },
                { type: 'char', label: '{', char: '{' },
                { type: 'char', label: '}', char: '}' },
                { type: 'char', label: '(', char: '(' },
                { type: 'char', label: ')', char: ')' },
                { type: 'char', label: ';', char: ';' },
                { type: 'char', label: ':', char: ':' },
                { type: 'char', label: '/', char: '/' },
                { type: 'key', label: '\u2190', key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
                { type: 'key', label: '\u2191', key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
                { type: 'key', label: '\u2193', key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
                { type: 'key', label: '\u2192', key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
            ],
        },
        {
            id: 'symbols',
            keys: [
                { type: 'char', label: '=', char: '=' },
                { type: 'char', label: '==', char: '==' },
                { type: 'char', label: '===', char: '===' },
                { type: 'char', label: '!=', char: '!=' },
                { type: 'char', label: '=>', char: '=>' },
                { type: 'char', label: '&&', char: '&&' },
                { type: 'char', label: '||', char: '||' },
                { type: 'char', label: '[', char: '[' },
                { type: 'char', label: ']', char: ']' },
                { type: 'char', label: '<', char: '<' },
                { type: 'char', label: '>', char: '>' },
                { type: 'char', label: '`', char: '`' },
                { type: 'char', label: '$', char: '$' },
                { type: 'char', label: '|', char: '|' },
                { type: 'char', label: '&', char: '&' },
                { type: 'char', label: '!', char: '!' },
                { type: 'char', label: '?', char: '?' },
                { type: 'char', label: '+', char: '+' },
                { type: 'char', label: '-', char: '-' },
                { type: 'char', label: '*', char: '*' },
            ],
        },
        {
            id: 'nav',
            keys: [
                { type: 'key', label: 'Home', key: 'Home', code: 'Home', keyCode: 36 },
                { type: 'key', label: 'End', key: 'End', code: 'End', keyCode: 35 },
                { type: 'key', label: 'PgUp', key: 'PageUp', code: 'PageUp', keyCode: 33 },
                { type: 'key', label: 'PgDn', key: 'PageDown', code: 'PageDown', keyCode: 34 },
                { type: 'key', label: 'Bksp', key: 'Backspace', code: 'Backspace', keyCode: 8 },
                { type: 'key', label: 'Del', key: 'Delete', code: 'Delete', keyCode: 46 },
                { type: 'key', label: 'Enter', key: 'Enter', code: 'Enter', keyCode: 13 },
                { type: 'char', label: 'Indent', char: '    ' },
                { type: 'char', label: '#', char: '#' },
                { type: 'char', label: '_', char: '_' },
                { type: 'char', label: '@', char: '@' },
                { type: 'char', label: '~', char: '~' },
                { type: 'char', label: '\\', char: '\\' },
                { type: 'char', label: '%', char: '%' },
                { type: 'char', label: '^', char: '^' },
            ],
        },
    ];

    protected accessoryActivePage = 0;

    protected ensureAccessory(): HTMLElement {
        if (this.accessory) {
            return this.accessory;
        }
        const wrapper = document.createElement('div');
        wrapper.className = 'theia-mobile-keyboard-accessory';
        wrapper.setAttribute('role', 'toolbar');
        wrapper.setAttribute(
            'aria-label',
            nls.localize('theia/core/mobileKeyboardAccessory', 'Code keys')
        );

        // Prevent focus theft from any interaction in the bar (taps, scroll-to-tap).
        const swallowFocusSteal = (e: Event): void => { e.preventDefault(); };
        wrapper.addEventListener('mousedown', swallowFocusSteal);
        wrapper.addEventListener('pointerdown', swallowFocusSteal);
        wrapper.addEventListener('touchstart', swallowFocusSteal, { passive: false });

        const pages = document.createElement('div');
        pages.className = 'theia-mobile-keyboard-accessory-pages';
        for (const page of MobileKeyboardHelper.ACCESSORY_PAGES) {
            const pageEl = document.createElement('div');
            pageEl.className = 'theia-mobile-keyboard-accessory-page';
            pageEl.dataset.pageId = page.id;
            for (const key of page.keys) {
                pageEl.appendChild(this.createAccessoryButton(key));
            }
            pages.appendChild(pageEl);
        }
        wrapper.appendChild(pages);

        const dots = document.createElement('div');
        dots.className = 'theia-mobile-keyboard-accessory-dots';
        for (let i = 0; i < MobileKeyboardHelper.ACCESSORY_PAGES.length; i++) {
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.tabIndex = -1;
            dot.className = 'theia-mobile-keyboard-accessory-dot';
            dot.setAttribute(
                'aria-label',
                nls.localize('theia/core/mobileKeyboardAccessoryPage', 'Show key page {0}', String(i + 1))
            );
            const pressDot = (e: Event): void => {
                e.preventDefault();
                this.setAccessoryActivePage(i, true);
            };
            dot.addEventListener('pointerup', pressDot);
            dot.addEventListener('click', pressDot);
            dots.appendChild(dot);
        }
        wrapper.appendChild(dots);

        this.installAccessoryPaging(pages);

        document.body.appendChild(wrapper);
        this.accessory = wrapper;
        this.setAccessoryActivePage(0, false);
        return wrapper;
    }

    protected installAccessoryPaging(pages: HTMLElement): void {
        let startX = 0;
        let trackedId: number | undefined;
        let captured = false;
        const SWIPE_THRESHOLD = 60;
        const SWIPE_MAX_DY = 24;
        let startY = 0;
        const onStart = (ev: TouchEvent): void => {
            if (ev.touches.length !== 1) {
                trackedId = undefined;
                return;
            }
            startX = ev.touches[0].clientX;
            startY = ev.touches[0].clientY;
            trackedId = ev.touches[0].identifier;
            captured = false;
        };
        const onMove = (ev: TouchEvent): void => {
            if (trackedId === undefined) {
                return;
            }
            const touch = Array.from(ev.touches).find(t => t.identifier === trackedId);
            if (!touch) {
                return;
            }
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;
            if (captured || Math.abs(dy) > SWIPE_MAX_DY) {
                return;
            }
            if (Math.abs(dx) >= SWIPE_THRESHOLD) {
                captured = true;
                const dir = dx < 0 ? 1 : -1;
                const next = this.accessoryActivePage + dir;
                if (next >= 0 && next < MobileKeyboardHelper.ACCESSORY_PAGES.length) {
                    this.setAccessoryActivePage(next, true);
                }
            }
        };
        const onEnd = (): void => {
            trackedId = undefined;
            captured = false;
        };
        pages.addEventListener('touchstart', onStart, { passive: true });
        pages.addEventListener('touchmove', onMove, { passive: true });
        pages.addEventListener('touchend', onEnd, { passive: true });
        pages.addEventListener('touchcancel', onEnd, { passive: true });
    }

    protected setAccessoryActivePage(index: number, animate: boolean): void {
        if (!this.accessory) {
            return;
        }
        const pageCount = MobileKeyboardHelper.ACCESSORY_PAGES.length;
        if (index < 0 || index >= pageCount) {
            return;
        }
        this.accessoryActivePage = index;
        const pages = this.accessory.querySelector<HTMLElement>('.theia-mobile-keyboard-accessory-pages');
        if (pages) {
            pages.style.transition = animate ? 'transform 220ms ease' : '';
            pages.style.transform = `translateX(-${index * 100}%)`;
        }
        const dots = this.accessory.querySelectorAll<HTMLElement>('.theia-mobile-keyboard-accessory-dot');
        dots.forEach((dot, i) => {
            dot.classList.toggle('theia-mod-active', i === index);
        });
    }

    protected removeAccessory(): void {
        if (this.accessory?.parentElement) {
            this.accessory.parentElement.removeChild(this.accessory);
        }
        this.accessory = undefined;
    }

    protected createAccessoryButton(def: AccessoryKey): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'theia-mobile-keyboard-accessory-btn';
        btn.tabIndex = -1;
        btn.textContent = def.label;
        const press = (e: Event): void => {
            e.preventDefault();
            this.dispatchAccessoryKey(def);
        };
        // `click` would arrive after focus already shifted on some browsers; using
        // pointerup/touchend keeps the host textarea focused when combined with the
        // bar-level pointerdown/touchstart preventDefault above.
        btn.addEventListener('pointerup', press);
        btn.addEventListener('click', press);
        return btn;
    }

    protected updateAccessoryVisibility(): void {
        const shouldShow = this.lastInsetPx > 0
            && this.lastEditorTarget !== undefined
            && document.contains(this.lastEditorTarget);
        if (!shouldShow) {
            if (this.accessory) {
                this.accessory.classList.remove('theia-mod-visible');
            }
            return;
        }
        const bar = this.ensureAccessory();
        bar.classList.add('theia-mod-visible');
        this.updateAccessoryPosition();
    }

    protected updateAccessoryPosition(): void {
        if (!this.accessory) {
            return;
        }
        this.accessory.style.bottom = `${this.lastInsetPx}px`;
    }

    /**
     * Lets the xterm viewport scroll past the last line while the OS keyboard covers the bottom
     * of the screen so the prompt stays readable above the keyboard.
     */
    protected updateTerminalScrollPadding(): void {
        const terminalFocused = this.lastTerminalTarget !== undefined
            && document.contains(this.lastTerminalTarget);
        const active = terminalFocused && this.lastInsetPx > 0;
        this.shellNode.classList.toggle('theia-mod-mobile-terminal-keyboard', active);
        if (!active) {
            document.documentElement.style.removeProperty('--theia-mobile-terminal-scroll-padding');
            return;
        }
        const paddingPx = this.lastInsetPx + MobileKeyboardHelper.TERMINAL_SCROLL_PADDING_EXTRA_PX;
        document.documentElement.style.setProperty('--theia-mobile-terminal-scroll-padding', `${paddingPx}px`);
        this.nudgeTerminalViewportScroll();
    }

    protected nudgeTerminalViewportScroll(): void {
        const textarea = this.lastTerminalTarget;
        if (!textarea || !document.contains(textarea)) {
            return;
        }
        const viewport = textarea.closest('.terminal-container')?.querySelector<HTMLElement>('.xterm-viewport');
        if (!viewport) {
            return;
        }
        requestAnimationFrame(() => {
            viewport.scrollTop = viewport.scrollHeight;
        });
    }

    protected dispatchAccessoryKey(def: AccessoryKey): void {
        const target = this.lastEditorTarget;
        if (!target || !document.contains(target)) {
            return;
        }
        // Re-focus in case anything stole it; pointerdown preventDefault should make
        // this unnecessary, but iOS Safari occasionally drops focus on toolbar taps.
        if (document.activeElement !== target) {
            target.focus({ preventScroll: true });
        }
        if (def.type === 'char') {
            this.insertCharacter(target, def.char);
        } else {
            this.dispatchKey(target, def);
        }
    }

    protected insertCharacter(target: HTMLTextAreaElement, char: string): void {
        // execCommand('insertText') triggers the same beforeinput/input pipeline
        // that Monaco's TextAreaInput observes, so it integrates with undo, IME,
        // and contenteditable handlers correctly across iOS Safari and Chromium.
        // It is deprecated in spec but still implemented in all relevant browsers.
        // eslint-disable-next-line deprecation/deprecation
        const inserted = document.execCommand?.('insertText', false, char);
        if (inserted) {
            return;
        }
        // Fallback: write into the textarea value and notify listeners. Does not
        // play perfectly with Monaco's IME tracking, but keeps the key functional.
        const start = target.selectionStart ?? target.value.length;
        const end = target.selectionEnd ?? target.value.length;
        const before = target.value.slice(0, start);
        const after = target.value.slice(end);
        target.value = `${before}${char}${after}`;
        const caret = start + char.length;
        target.setSelectionRange(caret, caret);
        target.dispatchEvent(new InputEvent('input', {
            data: char,
            inputType: 'insertText',
            bubbles: true,
        }));
    }

    protected dispatchKey(target: HTMLTextAreaElement, def: NamedKey): void {
        const init: KeyboardEventInit = {
            key: def.key,
            code: def.code,
            keyCode: def.keyCode,
            which: def.keyCode,
            bubbles: true,
            cancelable: true,
        };
        target.dispatchEvent(new KeyboardEvent('keydown', init));
        target.dispatchEvent(new KeyboardEvent('keyup', init));
    }
}

interface NamedKey {
    type: 'key';
    label: string;
    key: string;
    code: string;
    keyCode: number;
}

interface CharKey {
    type: 'char';
    label: string;
    char: string;
}

type AccessoryKey = NamedKey | CharKey;

interface AccessoryPage {
    id: 'code' | 'symbols' | 'nav';
    keys: ReadonlyArray<AccessoryKey>;
}
