/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, decorate, unmanaged } from "inversify";
import { Widget } from "@phosphor/widgets";
import { Message } from "@phosphor/messaging";
import { Disposable, DisposableCollection, MaybePromise } from '../../common';
import { KeyCode, KeysOrKeyCodes } from '../keys';

import PerfectScrollbar from 'perfect-scrollbar';

decorate(injectable(), Widget);
decorate(unmanaged(), Widget, 0);

export * from "@phosphor/widgets";
export * from "@phosphor/messaging";

export const DISABLED_CLASS = 'theia-mod-disabled';
export const COLLAPSED_CLASS = 'theia-mod-collapsed';
export const SELECTED_CLASS = 'theia-mod-selected';
export const FOCUS_CLASS = 'theia-mod-focus';

@injectable()
export class BaseWidget extends Widget {

    protected readonly toDispose = new DisposableCollection();
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
                this.scrollBar = new PerfectScrollbar(container, {
                    suppressScrollX: true
                });

                this.toDispose.push(Disposable.create(async () => {
                    if (this.scrollBar) {
                        this.scrollBar.destroy();
                        this.scrollBar = undefined;
                    }
                    // tslint:disable-next-line:no-null-keyword
                    container.style.overflow = null;
                }));
            })();
        }
    }

    protected getScrollContainer(): MaybePromise<HTMLElement> {
        return this.node;
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
        this.toDisposeOnDetach.push(addEventListener(element, type, listener));
    }

    protected addKeyListener<K extends keyof HTMLElementEventMap>(
        element: HTMLElement,
        keysOrKeyCodes: KeyCode.Predicate | KeysOrKeyCodes,
        action: (event: KeyboardEvent) => void, ...additionalEventTypes: K[]): void {
        this.toDisposeOnDetach.push(addKeyListener(element, keysOrKeyCodes, action, ...additionalEventTypes));
    }

    protected addClipboardListener<K extends 'cut' | 'copy' | 'paste'>(element: HTMLElement, type: K, listener: EventListenerOrEventListenerObject<K>): void {
        this.toDisposeOnDetach.push(addClipboardListener(element, type, listener));
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

// tslint:disable-next-line:no-any
export type EventListener<K extends keyof HTMLElementEventMap> = (this: HTMLElement, event: HTMLElementEventMap[K]) => any;
export interface EventListenerObject<K extends keyof HTMLElementEventMap> {
    handleEvent(evt: HTMLElementEventMap[K]): void;
}
export namespace EventListenerObject {
    // tslint:disable-next-line:no-any
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
        element.removeEventListener(type, listener)
    );
}

export function addKeyListener<K extends keyof HTMLElementEventMap>(
    element: HTMLElement,
    keysOrKeyCodes: KeyCode.Predicate | KeysOrKeyCodes,
    action: (event: KeyboardEvent) => void, ...additionalEventTypes: K[]): Disposable {

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
            action(e);
            e.stopPropagation();
            e.preventDefault();
        }
    }));
    for (const type of additionalEventTypes) {
        toDispose.push(addEventListener(element, type, e => {
            // tslint:disable-next-line:no-any
            const event = (type as any)['keydown'];
            action(event);
            e.stopPropagation();
            e.preventDefault();
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
