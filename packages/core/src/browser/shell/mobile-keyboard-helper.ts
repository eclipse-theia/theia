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

import { Disposable, DisposableCollection } from '../../common/disposable';
import { nls } from '../../common/nls';

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
    protected static readonly KEYBOARD_INSET_THRESHOLD_PX = 80;

    /** Selector for an editor textarea where the code accessory bar makes sense. */
    protected static readonly EDITOR_INPUT_SELECTOR = '.monaco-editor textarea.inputarea';

    protected readonly toDispose = new DisposableCollection();
    protected readonly shellNode: HTMLElement;

    protected accessory: HTMLElement | undefined;
    protected lastEditorTarget: HTMLTextAreaElement | undefined;
    protected lastInsetPx = 0;
    protected viewportRaf = 0;
    /**
     * Largest seen layout-viewport height while the keyboard is considered closed.
     * When `window.innerHeight` shrinks together with `visualViewport` (Android “resize”
     * behavior), `innerHeight - vv.height - offsetTop` stays ~0; comparing against this
     * baseline recovers the occluded band so `--theia-mobile-keyboard-inset` still applies.
     */
    protected stableLayoutViewportHeight = 0;
    protected focusNudgeHandles: number[] = [];

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
        this.shellNode.classList.remove('theia-mod-mobile-keyboard-open');
        this.lastEditorTarget = undefined;
        this.lastInsetPx = 0;
        this.stableLayoutViewportHeight = 0;
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
        if (occluded < MobileKeyboardHelper.KEYBOARD_INSET_THRESHOLD_PX) {
            this.stableLayoutViewportHeight = Math.max(
                this.stableLayoutViewportHeight,
                Math.round(layoutViewportGuess)
            );
        }
        if (occluded < MobileKeyboardHelper.KEYBOARD_INSET_THRESHOLD_PX && this.stableLayoutViewportHeight > 0) {
            const fromStable = Math.max(
                0,
                this.stableLayoutViewportHeight - vv.height - vv.offsetTop
            );
            if (fromStable >= MobileKeyboardHelper.KEYBOARD_INSET_THRESHOLD_PX) {
                occluded = fromStable;
            }
        }

        const inset = occluded >= MobileKeyboardHelper.KEYBOARD_INSET_THRESHOLD_PX ? Math.round(occluded) : 0;
        if (inset === this.lastInsetPx) {
            this.updateAccessoryPosition();
            return;
        }
        this.lastInsetPx = inset;
        if (inset > 0) {
            document.documentElement.style.setProperty('--theia-mobile-keyboard-inset', `${inset}px`);
            this.shellNode.classList.add('theia-mod-mobile-keyboard-open');
        } else {
            document.documentElement.style.removeProperty('--theia-mobile-keyboard-inset');
            this.shellNode.classList.remove('theia-mod-mobile-keyboard-open');
        }
        this.updateAccessoryVisibility();
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
            this.nudgeViewportAfterFocus();
        }
        if (!(target instanceof HTMLTextAreaElement)) {
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
     * Order matters: it is the on-screen left-to-right layout. Single chars dispatch
     * `insertText`; named keys dispatch a synthesized `KeyboardEvent` on the textarea.
     */
    protected static readonly ACCESSORY_KEYS: ReadonlyArray<AccessoryKey> = [
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
    ];

    protected ensureAccessory(): HTMLElement {
        if (this.accessory) {
            return this.accessory;
        }
        const bar = document.createElement('div');
        bar.className = 'theia-mobile-keyboard-accessory';
        bar.setAttribute('role', 'toolbar');
        bar.setAttribute(
            'aria-label',
            nls.localize('theia/core/mobileKeyboardAccessory', 'Code keys')
        );
        // Prevent focus theft from any interaction in the bar (taps, scroll-to-tap).
        const swallowFocusSteal = (e: Event): void => { e.preventDefault(); };
        bar.addEventListener('mousedown', swallowFocusSteal);
        bar.addEventListener('pointerdown', swallowFocusSteal);
        bar.addEventListener('touchstart', swallowFocusSteal, { passive: false });
        for (const def of MobileKeyboardHelper.ACCESSORY_KEYS) {
            bar.appendChild(this.createAccessoryButton(def));
        }
        document.body.appendChild(bar);
        this.accessory = bar;
        return bar;
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
