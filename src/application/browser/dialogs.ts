/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { Disposable, Key } from "../common";
import { Widget, BaseWidget, Message } from './widgets';

@injectable()
export class DialogProps {
    readonly title: string;
}

@injectable()
export abstract class AbstractDialog<T> extends BaseWidget {

    protected readonly titleNode: HTMLDivElement;
    protected readonly contentNode: HTMLDivElement;
    protected readonly closeCrossNode: HTMLElement;

    protected resolve: undefined | ((value: T) => void);
    protected reject: undefined | ((reason: any) => void);

    protected closeButton: HTMLButtonElement | undefined;
    protected acceptButton: HTMLButtonElement | undefined;

    constructor(
        @inject(DialogProps) protected readonly props: DialogProps
    ) {
        super();
        this.addClass('dialogBlock');

        this.toDispose.push(Disposable.create(() => {
            if (this.reject) {
                Widget.detach(this);
            }
        }));

        this.contentNode = document.createElement("div");
        this.contentNode.classList.add('dialogContent');
        this.node.appendChild(this.contentNode);

        this.titleNode = document.createElement("div");
        this.titleNode.classList.add('dialogTitle');
        this.titleNode.textContent = props.title;
        this.contentNode.appendChild(this.titleNode);

        this.closeCrossNode = document.createElement("i");
        this.closeCrossNode.classList.add('dialogClose');
        this.closeCrossNode.classList.add('fa');
        this.closeCrossNode.classList.add('fa-times');
        this.closeCrossNode.setAttribute('aria-hidden', 'true');
        this.contentNode.appendChild(this.closeCrossNode);
        this.update();
    }

    protected appendCloseButton(text?: string): void {
        this.contentNode.appendChild(this.createCloseButton(text));
    }

    protected appendAcceptButton(text?: string): void {
        this.contentNode.appendChild(this.createAcceptButton(text));
    }

    protected createCloseButton(text: string = 'Cancel'): HTMLButtonElement {
        return this.closeButton = this.createButton(text);
    }

    protected createAcceptButton(text: string = 'OK'): HTMLButtonElement {
        return this.acceptButton = this.createButton(text);
    }

    protected createButton(text: string): HTMLButtonElement {
        const button = document.createElement("button");
        button.classList.add('dialogButton');
        button.textContent = text;
        return button;
    }

    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        if (this.closeButton) {
            this.addCloseAction(this.closeButton, 'click');
        }
        if (this.acceptButton) {
            this.addAcceptAction(this.acceptButton, 'click');
        }
        this.addCloseAction(this.closeCrossNode, 'click');
        this.addKeyListener(document.body, Key.ESCAPE, () => this.close());
        this.addKeyListener(document.body, Key.ENTER, () => this.accept());
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

    protected onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
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

    protected addCloseAction<K extends keyof HTMLElementEventMap>(element: HTMLElement, ...additionalEventTypes: K[]): void {
        this.addKeyListener(element, Key.ESCAPE, () => this.close(), ...additionalEventTypes);
    }

    protected addAcceptAction<K extends keyof HTMLElementEventMap>(element: HTMLElement, ...additionalEventTypes: K[]): void {
        this.addKeyListener(element, Key.ENTER, () => this.accept(), ...additionalEventTypes);
    }

}

@injectable()
export class ConfirmDialogProps extends DialogProps {
    readonly msg: string;
    readonly cancel?: string;
    readonly ok?: string;
}


export class ConfirmDialog extends AbstractDialog<void> {

    constructor(
        @inject(ConfirmDialogProps) protected readonly props: ConfirmDialogProps
    ) {
        super(props);

        const messageNode = document.createElement("div");
        messageNode.textContent = props.msg;
        messageNode.setAttribute('style', 'flex: 1 100%; padding-bottom: calc(var(--theia-ui-padding)*3);');
        this.contentNode.appendChild(messageNode);
        this.appendCloseButton(props.cancel);
        this.appendAcceptButton(props.ok);
    }

    get value(): void {
        return;
    }

}

@injectable()
export class SingleTextInputDialogProps extends DialogProps {
    readonly confirmButtonLabel?: string;
    readonly initialValue?: string;
    readonly validate?: (input: string) => string;
}

export class SingleTextInputDialog extends AbstractDialog<string> {

    protected readonly errorMessageNode: HTMLDivElement;
    protected readonly inputField: HTMLInputElement;

    constructor(
        @inject(SingleTextInputDialogProps) protected readonly props: SingleTextInputDialogProps
    ) {
        super(props);

        this.inputField = document.createElement("input");
        this.inputField.classList.add('dialogButton');
        this.inputField.type = 'text';
        this.inputField.setAttribute('style', 'flex: 1 auto;');
        this.inputField.value = props.initialValue || '';
        this.contentNode.appendChild(this.inputField);

        this.appendAcceptButton(props.confirmButtonLabel);

        this.errorMessageNode = document.createElement("div");
        this.errorMessageNode.setAttribute('style', 'flex: 1 100%;');

        this.contentNode.appendChild(this.errorMessageNode);
    }

    get value(): string {
        return this.inputField.value;
    }

    isValid(value: string): string {
        if (this.props.validate) {
            return this.props.validate(value);
        }
        return super.isValid(value);
    }

    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.addUpdateListener(this.inputField, 'input');
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