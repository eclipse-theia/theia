/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { Widget } from '@phosphor/widgets';
import { DisposableCollection, Disposable } from "../common";

export const DialogTitle = Symbol('DialogTitle');

@injectable()
export abstract class AbstractDialog<T> implements Disposable {

    protected readonly titleNode: HTMLDivElement;
    protected readonly contentNode: HTMLDivElement;
    protected readonly closeCrossNode: HTMLElement;

    protected readonly widget: Widget;
    protected readonly toDispose = new DisposableCollection();
    protected readonly toDisposeOnDetach = new DisposableCollection();

    protected resolve: undefined | ((value: T) => void);
    protected reject: undefined | ((reason: any) => void);

    constructor(
        @inject(DialogTitle) title: string
    ) {
        this.widget = new Widget()
        this.widget.addClass('dialogBlock')

        const wrapper = document.createElement("div")
        wrapper.classList.add('dialogWrapper')
        this.widget.node.appendChild(wrapper)
        this.titleNode = document.createElement("div")
        this.titleNode.classList.add('dialogTitle')
        this.titleNode.textContent = title
        wrapper.appendChild(this.titleNode)

        this.contentNode = document.createElement("div")
        this.contentNode.classList.add('dialogContent')
        wrapper.appendChild(this.contentNode)

        this.closeCrossNode = document.createElement("i")
        this.closeCrossNode.classList.add('dialogClose')
        this.closeCrossNode.classList.add('fa')
        this.closeCrossNode.classList.add('fa-times')
        this.closeCrossNode.setAttribute('aria-hidden', 'true')
        wrapper.appendChild(this.closeCrossNode)
    }

    protected attach(): void {
        Widget.attach(this.widget, document.body);
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

    protected detach(): void {
        this.toDisposeOnDetach.dispose();
        Widget.detach(this.widget);
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
            this.attach();
        });
    }

    dispose(): void {
        if (this.reject) {
            this.detach();
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
                this.detach();
            }
        }
    }

    abstract get value(): T;
    isValid(value: T): string {
        return '';
    }
    protected setErrorMessage(error: string): void {
        console.warn(error);
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

    protected readonly okButton: HTMLButtonElement;
    protected readonly cancelButton: HTMLButtonElement;

    constructor(title: string, msg: string, cancel = 'Cancel', ok = 'OK') {
        super(title)

        const messageNode = document.createElement("div")
        messageNode.textContent = msg
        messageNode.setAttribute('style', 'flex: 1 100%; padding-bottom: calc(var(--theia-ui-padding)*3);')
        this.contentNode.appendChild(messageNode)

        const cancelButton = document.createElement("button");
        cancelButton.classList.add('dialogButton');
        cancelButton.textContent = cancel;
        cancelButton.setAttribute('style', 'flex: 1 20%;');
        this.contentNode.appendChild(cancelButton);
        this.cancelButton = cancelButton;

        const okButton = document.createElement("button");
        okButton.classList.add('dialogButton');
        okButton.classList.add('main');
        okButton.textContent = ok;
        okButton.setAttribute('style', 'flex: 1 20%;');
        this.contentNode.appendChild(okButton);
        this.okButton = okButton;
    }

    protected attach(): void {
        super.attach();
        this.addCloseListener(this.cancelButton, 'click');
        this.addAcceptListener(this.okButton, 'click');
        this.okButton.focus();
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
    protected readonly okButton: HTMLButtonElement;

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

        this.okButton = document.createElement("button");
        this.okButton.classList.add('dialogButton');
        this.okButton.classList.add('main');
        this.okButton.setAttribute('style', 'flex: 1 20%;');
        this.okButton.textContent = options.confirmButtonLabel || 'OK';

        this.contentNode.appendChild(this.okButton);

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

    protected attach(): void {
        super.attach();
        this.addValidateListener(this.inputField, 'input');
        this.addAcceptListener(this.okButton, 'click');
        this.inputField.focus();
        this.inputField.select();
    }

    protected setErrorMessage(error: string) {
        if (error) {
            this.widget.addClass('error');
            this.okButton.disabled = true;
        } else {
            this.widget.removeClass('error');
            this.okButton.disabled = false;
        }
        this.errorMessageNode.innerHTML = error;
    }

}