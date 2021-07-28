/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { injectable, decorate, unmanaged } from 'inversify';
import { Widget } from '@phosphor/widgets';
import { Message } from '@phosphor/messaging';
import { Emitter, Event, Disposable, DisposableCollection, MaybePromise } from '../../common';
import { KeyCode, KeysOrKeyCodes } from '../keyboard/keys';

import PerfectScrollbar from 'perfect-scrollbar';

decorate(injectable(), Widget);
decorate(unmanaged(), Widget, 0);

export * from '@phosphor/widgets';
export * from '@phosphor/messaging';

export const DISABLED_CLASS = 'theia-mod-disabled';
export const EXPANSION_TOGGLE_CLASS = 'theia-ExpansionToggle';
export const COLLAPSED_CLASS = 'theia-mod-collapsed';
export const BUSY_CLASS = 'theia-mod-busy';
export const SELECTED_CLASS = 'theia-mod-selected';
export const FOCUS_CLASS = 'theia-mod-focus';
export const DEFAULT_SCROLL_OPTIONS: PerfectScrollbar.Options = {
    suppressScrollX: true,
    minScrollbarLength: 35,
};

@injectable()
export class BaseWidget extends Widget {

    protected readonly onScrollYReachEndEmitter = new Emitter<void>();
    readonly onScrollYReachEnd: Event<void> = this.onScrollYReachEndEmitter.event;
    protected readonly onScrollUpEmitter = new Emitter<void>();
    readonly onScrollUp: Event<void> = this.onScrollUpEmitter.event;
    protected readonly onDidChangeVisibilityEmitter = new Emitter<boolean>();
    readonly onDidChangeVisibility = this.onDidChangeVisibilityEmitter.event;
    protected readonly onDidDisposeEmitter = new Emitter<void>();
    readonly onDidDispose = this.onDidDisposeEmitter.event;

    protected readonly toDispose = new DisposableCollection(
        this.onDidDisposeEmitter,
        Disposable.create(() => this.onDidDisposeEmitter.fire()),
        this.onScrollYReachEndEmitter,
        this.onScrollUpEmitter,
        this.onDidChangeVisibilityEmitter
    );
    protected readonly toDisposeOnDetach = new DisposableCollection();
    protected scrollBar?: PerfectScrollbar;
    protected scrollOptions?: PerfectScrollbar.Options;

    dispose(): void {
        if (this.isDisposed) {
            return;
        }
        super.dispose();
        this.toDispose.dispose();
    }

    protected onCloseRequest(msg: Message): void {
        super.onCloseRequest(msg);
        this.dispose();
    }

    protected onBeforeAttach(msg: Message): void {
        if (this.title.iconClass === '') {
            this.title.iconClass = 'no-icon';
        }
        super.onBeforeAttach(msg);
    }

    protected onAfterDetach(msg: Message): void {
        if (this.title.iconClass === 'no-icon') {
            this.title.iconClass = '';
        }
        super.onAfterDetach(msg);
    }

    protected onBeforeDetach(msg: Message): void {
        this.toDisposeOnDetach.dispose();
        super.onBeforeDetach(msg);
    }

    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        if (this.scrollOptions) {
            (async () => {
                const container = await this.getScrollContainer();
                container.style.overflow = 'hidden';
                this.scrollBar = new PerfectScrollbar(container, this.scrollOptions);
                this.disableScrollBarFocus(container);
                this.toDisposeOnDetach.push(addEventListener(container, <any>'ps-y-reach-end', () => { this.onScrollYReachEndEmitter.fire(undefined); }));
                this.toDisposeOnDetach.push(addEventListener(container, <any>'ps-scroll-up', () => { this.onScrollUpEmitter.fire(undefined); }));
                this.toDisposeOnDetach.push(Disposable.create(() => {
                    if (this.scrollBar) {
                        this.scrollBar.destroy();
                        this.scrollBar = undefined;
                    }
                    container.style.overflow = 'initial';
                }));
            })();
        }
    }

    protected getScrollContainer(): MaybePromise<HTMLElement> {
        return this.node;
    }

    protected disableScrollBarFocus(scrollContainer: HTMLElement): void {
        for (const thumbs of [scrollContainer.getElementsByClassName('ps__thumb-x'), scrollContainer.getElementsByClassName('ps__thumb-y')]) {
            for (let i = 0; i < thumbs.length; i++) {
                const element = thumbs.item(i);
                if (element) {
                    element.removeAttribute('tabIndex');
                }
            }
        }
    }

    protected onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        if (this.scrollBar) {
            this.scrollBar.update();
        }
    }

    protected addUpdateListener<K extends keyof HTMLElementEventMap>(element: HTMLElement, type: K, useCapture?: boolean): void {
        this.addEventListener(element, type, e => {
            this.update();
            e.preventDefault();
        }, useCapture);
    }

    protected addEventListener<K extends keyof HTMLElementEventMap>(element: HTMLElement, type: K, listener: EventListenerOrEventListenerObject<K>, useCapture?: boolean): void {
        this.toDisposeOnDetach.push(addEventListener(element, type, listener, useCapture));
    }

    protected addKeyListener<K extends keyof HTMLElementEventMap>(
        element: HTMLElement,
        keysOrKeyCodes: KeyCode.Predicate | KeysOrKeyCodes,
        action: (event: KeyboardEvent) => boolean | void | Object, ...additionalEventTypes: K[]): void {
        this.toDisposeOnDetach.push(addKeyListener(element, keysOrKeyCodes, action, ...additionalEventTypes));
    }

    protected addClipboardListener<K extends 'cut' | 'copy' | 'paste'>(element: HTMLElement, type: K, listener: EventListenerOrEventListenerObject<K>): void {
        this.toDisposeOnDetach.push(addClipboardListener(element, type, listener));
    }

    setFlag(flag: Widget.Flag): void {
        super.setFlag(flag);
        if (flag === Widget.Flag.IsVisible) {
            this.onDidChangeVisibilityEmitter.fire(this.isVisible);
        }
    }

    clearFlag(flag: Widget.Flag): void {
        super.clearFlag(flag);
        if (flag === Widget.Flag.IsVisible) {
            this.onDidChangeVisibilityEmitter.fire(this.isVisible);
        }
    }
}

export function setEnabled(element: HTMLElement, enabled: boolean): void {
    element.classList.toggle(DISABLED_CLASS, !enabled);
    element.tabIndex = enabled ? 0 : -1;
}

export function createIconButton(...classNames: string[]): HTMLSpanElement {
    const icon = document.createElement('i');
    icon.classList.add(...classNames);
    const button = document.createElement('span');
    button.tabIndex = 0;
    button.appendChild(icon);
    return button;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventListener<K extends keyof HTMLElementEventMap> = (this: HTMLElement, event: HTMLElementEventMap[K]) => any;
export interface EventListenerObject<K extends keyof HTMLElementEventMap> {
    handleEvent(evt: HTMLElementEventMap[K]): void;
}
export namespace EventListenerObject {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export function is<K extends keyof HTMLElementEventMap>(listener: any | undefined): listener is EventListenerObject<K> {
        return !!listener && 'handleEvent' in listener;
    }
}
export type EventListenerOrEventListenerObject<K extends keyof HTMLElementEventMap> = EventListener<K> | EventListenerObject<K>;
export function addEventListener<K extends keyof HTMLElementEventMap>(
    element: HTMLElement, type: K, listener: EventListenerOrEventListenerObject<K>, useCapture?: boolean
): Disposable {
    element.addEventListener(type, listener, useCapture);
    return Disposable.create(() =>
        element.removeEventListener(type, listener, useCapture)
    );
}

export function addKeyListener<K extends keyof HTMLElementEventMap>(
    element: HTMLElement,
    keysOrKeyCodes: KeyCode.Predicate | KeysOrKeyCodes,
    action: (event: KeyboardEvent) => boolean | void | Object, ...additionalEventTypes: K[]): Disposable {

    const toDispose = new DisposableCollection();
    const keyCodePredicate = (() => {
        if (typeof keysOrKeyCodes === 'function') {
            return keysOrKeyCodes;
        } else {
            return (actual: KeyCode) => KeysOrKeyCodes.toKeyCodes(keysOrKeyCodes).some(k => k.equals(actual));
        }
    })();
    toDispose.push(addEventListener(element, 'keydown', e => {
        const kc = KeyCode.createKeyCode(e);
        if (keyCodePredicate(kc)) {
            const result = action(e);
            if (typeof result !== 'boolean' || result) {
                e.stopPropagation();
                e.preventDefault();
            }
        }
    }));
    for (const type of additionalEventTypes) {
        toDispose.push(addEventListener(element, type, e => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const event = (type as any)['keydown'];
            const result = action(event);
            if (typeof result !== 'boolean' || result) {
                e.stopPropagation();
                e.preventDefault();
            }
        }));
    }
    return toDispose;
}

export function addClipboardListener<K extends 'cut' | 'copy' | 'paste'>(element: HTMLElement, type: K, listener: EventListenerOrEventListenerObject<K>): Disposable {
    const documentListener = (e: ClipboardEvent) => {
        const activeElement = document.activeElement;
        if (activeElement && element.contains(activeElement)) {
            if (EventListenerObject.is(listener)) {
                listener.handleEvent(e);
            } else {
                listener.bind(element)(e);
            }
        }
    };
    document.addEventListener(type, documentListener);
    return Disposable.create(() =>
        document.removeEventListener(type, documentListener)
    );
}

/**
 * Resolves when the given widget is detached and hidden.
 */
export function waitForClosed(widget: Widget): Promise<void> {
    return waitForVisible(widget, false, false);
}

/**
 * Resolves when the given widget is attached and visible.
 */
export function waitForRevealed(widget: Widget): Promise<void> {
    return waitForVisible(widget, true, true);
}

/**
 * Resolves when the given widget is hidden regardless of attachment.
 */
export function waitForHidden(widget: Widget): Promise<void> {
    return waitForVisible(widget, true);
}

function waitForVisible(widget: Widget, visible: boolean, attached?: boolean): Promise<void> {
    if ((typeof attached !== 'boolean' || widget.isAttached === attached) &&
        (widget.isVisible === visible || (widget.node.style.visibility !== 'hidden') === visible)
    ) {
        return new Promise(resolve => window.requestAnimationFrame(() => resolve()));
    }
    return new Promise(resolve => {
        const waitFor = () => window.requestAnimationFrame(() => {
            if ((typeof attached !== 'boolean' || widget.isAttached === attached) &&
                (widget.isVisible === visible || (widget.node.style.visibility !== 'hidden') === visible)) {
                window.requestAnimationFrame(() => resolve());
            } else {
                waitFor();
            }
        });
        waitFor();
    });
}
