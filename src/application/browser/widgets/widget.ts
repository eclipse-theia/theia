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

}