/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { Widget } from '@phosphor/widgets';
import { Message } from "@phosphor/messaging";
import { DisposableCollection, Disposable } from "../common";

export const DialogTitle = Symbol('DialogTitle');

@injectable()
export abstract class AbstractDialog<T> extends Widget {

    protected readonly titleNode: HTMLDivElement;
    protected readonly contentNode: HTMLDivElement;
    protected readonly closeCrossNode: HTMLElement;

    protected readonly toDispose = new DisposableCollection();
    protected readonly toDisposeOnDetach = new DisposableCollection();

    protected resolve: undefined | ((value: T) => void);
    protected reject: undefined | ((reason: any) => void);

    protected closeButton: HTMLButtonElement | undefined;
    protected acceptButton: HTMLButtonElement | undefined;

    constructor(
        @inject(DialogTitle) title: string
    ) {
        super();
        this.addClass('dialogBlock');

        this.contentNode = document.createElement("div");
        this.contentNode.classList.add('dialogContent');
        this.node.appendChild(this.contentNode);

        this.titleNode = document.createElement("div");
        this.titleNode.classList.add('dialogTitle');
        this.titleNode.textContent = title;
        this.contentNode.appendChild(this.titleNode);

        this.closeCrossNode = document.createElement("i");
        this.closeCrossNode.classList.add('dialogClose');
        this.closeCrossNode.classList.add('fa');
        this.closeCrossNode.classList.add('fa-times');
        this.closeCrossNode.setAttribute('aria-hidden', 'true');
        this.contentNode.appendChild(this.closeCrossNode);
    }

    protected appendCloseButton(text: string = 'Cancel'): void {
        this.closeButton = this.appendButton(text);
    }

    protected appendAcceptButton(text: string = 'OK'): void {
        this.acceptButton = this.appendButton(text);
    }

    protected appendButton(text: string): HTMLButtonElement {
        const button = document.createElement("button");
        button.classList.add('dialogButton');
        button.textContent = text;
        this.contentNode.appendChild(button);
        return button;
    }

    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        if (this.closeButton) {
            this.addCloseListener(this.closeButton, 'click');
        }
        if (this.acceptButton) {
            this.addAcceptListener(this.acceptButton, 'click');
        }
        this.addCloseListener(this.closeCrossNode, 'click');
        this.addEventListener(document.body, 'keydown', (e: KeyboardEvent) => {
            let isEscape = false
            let isEnter = false
            if ("key" in e) {
                isEscape = (e.key === "Escape" || e.key === "Esc")
                isEnter = e.key === "Enter"
            } else {
                isEscape = (e.keyCode === 27)
                isEnter = (e.keyCode === 13)
            }
            if (isEscape) {
                this.dispose();
            } else if (isEnter) {
                this.accept();
            }
        });
    }

    protected onBeforeDetach(msg: Message): void {
        this.toDisposeOnDetach.dispose();
        super.onBeforeDetach(msg);
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        if (this.acceptButton) {
            this.acceptButton.focus();
        }
    }

    open(): Promise<T> {
        if (this.resolve) {
            return Promise.reject('The dialog is already opened.')
        }
        return new Promise<T>((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
            this.toDisposeOnDetach.push(Disposable.create(() => {
                this.resolve = undefined;
                this.reject = undefined;
            }));
            Widget.attach(this, document.body);
            this.activate();
        });
    }

    dispose(): void {
        super.dispose();
        if (this.reject) {
            Widget.detach(this);
        }
        this.toDispose.dispose();
    }

    protected validate(): void {
        if (this.resolve) {
            const value = this.value;
            const error = this.isValid(value);
            this.setErrorMessage(error);
        }
    }

    protected accept(): void {
        if (this.resolve) {
            const value = this.value;
            const error = this.isValid(value);
            if (error) {
                this.setErrorMessage(error);
            } else {
                this.resolve(value);
                Widget.detach(this);
            }
        }
    }

    abstract get value(): T;
    isValid(value: T): string {
        return '';
    }
    protected setErrorMessage(error: string): void {
        if (this.acceptButton) {
            this.acceptButton.disabled = !!error;
        }
    }

    protected addValidateListener<K extends keyof HTMLElementEventMap>(element: HTMLElement, type: K): void {
        this.addEventListener(element, type, e => {
            this.validate();
            e.preventDefault();
            return false;
        });
    }

    protected addCloseListener<K extends keyof HTMLElementEventMap>(element: HTMLElement, type: K): void {
        this.addEventListener(element, type, e => {
            this.dispose();
            e.preventDefault();
            return false;
        });
    }

    protected addAcceptListener<K extends keyof HTMLElementEventMap>(element: HTMLElement, type: K): void {
        this.addEventListener(element, type, e => {
            this.accept();
            e.preventDefault();
            return false;
        });
    }

    protected addEventListener<K extends keyof HTMLElementEventMap>(element: HTMLElement, type: K, listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any): void {
        element.addEventListener(type, listener);
        this.toDisposeOnDetach.push(Disposable.create(() =>
            element.removeEventListener(type, listener)
        ));
    }

}

export class ConfirmDialog extends AbstractDialog<void> {

    constructor(title: string, msg: string, protected readonly cancel = 'Cancel', protected readonly ok = 'OK') {
        super(title)

        const messageNode = document.createElement("div");
        messageNode.textContent = msg;
        messageNode.setAttribute('style', 'flex: 1 100%; padding-bottom: calc(var(--theia-ui-padding)*3);');
        this.contentNode.appendChild(messageNode);
        this.appendCloseButton(this.cancel);
        this.appendAcceptButton(this.ok);
    }

    get value(): void {
        return;
    }

}

export namespace SingleTextInputDialog {
    export interface Options {
        confirmButtonLabel?: string,
        initialValue?: string,
        validate?(input: string): string
    }
}

export class SingleTextInputDialog extends AbstractDialog<string> {

    protected readonly errorMessageNode: HTMLDivElement;
    protected readonly inputField: HTMLInputElement;

    constructor(
        title: string,
        protected readonly options: SingleTextInputDialog.Options
    ) {
        super(title);

        this.inputField = document.createElement("input");
        this.inputField.classList.add('dialogButton');
        this.inputField.type = 'text';
        this.inputField.setAttribute('style', 'flex: 1 auto;');
        this.inputField.value = options.initialValue || '';
        this.contentNode.appendChild(this.inputField);

        this.appendAcceptButton(options.confirmButtonLabel);

        this.errorMessageNode = document.createElement("div");
        this.errorMessageNode.setAttribute('style', 'flex: 1 100%;');

        this.contentNode.appendChild(this.errorMessageNode);
    }

    get value(): string {
        return this.inputField.value;
    }

    isValid(value: string): string {
        if (this.options.validate) {
            return this.options.validate(value);
        }
        return super.isValid(value);
    }

    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.addValidateListener(this.inputField, 'input');
    }

    protected onActivateRequest(msg: Message): void {
        this.inputField.focus();
        this.inputField.select();
    }

    protected setErrorMessage(error: string) {
        super.setErrorMessage(error);
        if (error) {
            this.addClass('error');
        } else {
            this.removeClass('error');
        }
        this.errorMessageNode.innerHTML = error;
    }

}