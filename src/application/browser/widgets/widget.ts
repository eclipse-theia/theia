/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, decorate, unmanaged } from "inversify";
import { Widget } from "@phosphor/widgets";
import { Message } from "@phosphor/messaging";
import { DisposableCollection, Disposable } from "../../common";

decorate(injectable(), Widget);
decorate(unmanaged(), Widget, 0);

export * from "@phosphor/widgets";
export * from "@phosphor/messaging";

export const DISABLED_CLASS = 'theia-mod-disabled';
export const COLLAPSED_CLASS = 'theia-mod-collapsed';
export const SELECTED_CLASS = 'theia-mod-selected';

@injectable()
export class BaseWidget extends Widget {

    protected readonly toDispose = new DisposableCollection();
    protected readonly toDisposeOnDetach = new DisposableCollection();

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

    protected addUpdateListener<K extends keyof HTMLElementEventMap>(element: HTMLElement, type: K): void {
        this.addEventListener(element, type, e => {
            this.update();
            e.preventDefault();
        });
    }

    protected addEventListener<K extends keyof HTMLElementEventMap>(element: HTMLElement, type: K, listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any): void;
    protected addEventListener<K extends keyof HTMLElementEventMap>(element: HTMLElement, type: K, listener: EventListenerOrEventListenerObject): void;
    protected addEventListener<K extends keyof HTMLElementEventMap>(
        element: HTMLElement,
        type: K,
        listener: ((this: HTMLElement, ev: HTMLElementEventMap[K]) => any) | EventListenerOrEventListenerObject
    ): void {
        element.addEventListener(type, listener);
        this.toDisposeOnDetach.push(Disposable.create(() =>
            element.removeEventListener(type, listener)
        ));
    }

    protected addAction<K extends keyof HTMLElementEventMap>(element: HTMLElement, action: EventAction<K>) {
        this.addEventListener(element, action.type, e => {
            if (!action.isActive || action.isActive(e)) {
                action.run();
                e.stopPropagation();
                e.preventDefault();
            }
        });
    }

    protected addActions<K extends keyof HTMLElementEventMap>(element: HTMLElement, run: () => void, ...eventTypes: K[]) {
        for (const type of eventTypes) {
            this.addAction(element, { type, run });
        }
    }

    protected addKeyboardAction<K extends keyof HTMLElementEventMap>(element: HTMLElement, action: EventAction<'keydown'>, ...eventTypes: K[]): void {
        this.addAction(element, action);
        this.addActions(element, action.run.bind(action), ...eventTypes);
    }

    protected addEscAction<K extends keyof HTMLElementEventMap>(element: HTMLElement, run: () => void, ...additionalEventTypes: K[]): void {
        this.addKeyboardAction(element, {
            type: 'keydown',
            run,
            isActive: e => this.isEsc(e)
        }, ...additionalEventTypes);
    }

    protected addEnterAction<K extends keyof HTMLElementEventMap>(element: HTMLElement, run: () => void, ...additionalEventTypes: K[]): void {
        this.addKeyboardAction(element, {
            type: 'keydown',
            run,
            isActive: e => this.isEnter(e)
        }, ...additionalEventTypes);
    }

    protected isEnter(e: KeyboardEvent): boolean {
        if ('key' in e) {
            return e.key === 'Enter';
        }
        return e.keyCode === 13;
    }

    protected isEsc(e: KeyboardEvent): boolean {
        if ('key' in e) {
            return e.key === 'Escape' || e.key === 'Esc';
        }
        return e.keyCode === 27;
    }

}

export interface EventAction<K extends keyof HTMLElementEventMap> {
    readonly type: K;
    run(): void;
    isActive?(e: HTMLElementEventMap[K]): boolean;
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