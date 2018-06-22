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

import { injectable, inject } from "inversify";
import { Disposable } from "../common";
import { Key } from "./keys";
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
    protected readonly controlPanel: HTMLDivElement;
    protected readonly errorMessageNode: HTMLDivElement;

    protected resolve: undefined | ((value: T) => void);
    protected reject: undefined | ((reason: any) => void);

    protected closeButton: HTMLButtonElement | undefined;
    protected acceptButton: HTMLButtonElement | undefined;

    constructor(
        @inject(DialogProps) protected readonly props: DialogProps
    ) {
        super();
        this.addClass('dialogOverlay');
        this.toDispose.push(Disposable.create(() => {
            if (this.reject) {
                Widget.detach(this);
            }
        }));
        const container = document.createElement("div");
        container.classList.add('dialogBlock');
        this.node.appendChild(container);

        const titleContentNode = document.createElement("div");
        titleContentNode.classList.add('dialogTitle');
        container.appendChild(titleContentNode);

        this.titleNode = document.createElement("div");
        this.titleNode.textContent = props.title;
        titleContentNode.appendChild(this.titleNode);

        this.closeCrossNode = document.createElement("i");
        this.closeCrossNode.classList.add('fa');
        this.closeCrossNode.classList.add('fa-times');
        this.closeCrossNode.classList.add('closeButton');
        titleContentNode.appendChild(this.closeCrossNode);

        this.contentNode = document.createElement("div");
        this.contentNode.classList.add('dialogContent');
        container.appendChild(this.contentNode);

        this.controlPanel = document.createElement('div');
        this.controlPanel.classList.add('dialogControl');
        container.appendChild(this.controlPanel);

        this.errorMessageNode = document.createElement('div');
        this.errorMessageNode.classList.add('error');
        this.errorMessageNode.setAttribute('style', 'flex: 2');
        this.controlPanel.appendChild(this.errorMessageNode);

        this.update();
    }

    protected appendCloseButton(text: string = 'Cancel'): HTMLButtonElement {
        this.closeButton = this.createButton(text);
        this.controlPanel.appendChild(this.closeButton);
        this.closeButton.classList.add('secondary');
        return this.closeButton;
    }

    protected appendAcceptButton(text: string = 'OK'): HTMLButtonElement {
        this.acceptButton = this.createButton(text);
        this.controlPanel.appendChild(this.acceptButton);
        this.acceptButton.classList.add('main');
        return this.acceptButton;
    }

    protected createButton(text: string): HTMLButtonElement {
        const button = document.createElement("button");
        button.classList.add('theia-button');
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
        this.addKeyListener(document.body, Key.ESCAPE, e => this.handleEscape(e));
        this.addKeyListener(document.body, Key.ENTER, e => this.handleEnter(e));
    }

    protected handleEscape(event: KeyboardEvent): boolean | void {
        this.close();
    }

    protected handleEnter(event: KeyboardEvent): boolean | void {
        if (event.target instanceof HTMLTextAreaElement) {
            return false;
        }
        this.accept();
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        if (this.acceptButton) {
            this.acceptButton.focus();
        }
    }

    open(): Promise<T> {
        if (this.resolve) {
            return Promise.reject('The dialog is already opened.');
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

    protected setErrorMessage(error: string) {
        if (this.acceptButton) {
            this.acceptButton.disabled = !!error;
        }
        this.errorMessageNode.innerHTML = error;
    }

    protected addCloseAction<K extends keyof HTMLElementEventMap>(element: HTMLElement, ...additionalEventTypes: K[]): void {
        this.addKeyListener(element, Key.ENTER, () => this.close(), ...additionalEventTypes);
    }

    protected addAcceptAction<K extends keyof HTMLElementEventMap>(element: HTMLElement, ...additionalEventTypes: K[]): void {
        this.addKeyListener(element, Key.ENTER, () => this.accept(), ...additionalEventTypes);
    }

}

@injectable()
export class ConfirmDialogProps extends DialogProps {
    readonly msg: string | HTMLElement;
    readonly cancel?: string;
    readonly ok?: string;
}

export class ConfirmDialog extends AbstractDialog<boolean> {

    constructor(
        @inject(ConfirmDialogProps) protected readonly props: ConfirmDialogProps
    ) {
        super(props);

        this.contentNode.appendChild(this.createMessageNode(this.props.msg));
        this.appendCloseButton(props.cancel);
        this.appendAcceptButton(props.ok);
    }

    protected onCloseRequest(msg: Message): void {
        super.onCloseRequest(msg);
        this.confirmed = false;
        this.accept();
    }

    protected confirmed = true;
    get value(): boolean {
        return this.confirmed;
    }

    protected createMessageNode(msg: string | HTMLElement): HTMLElement {
        if (typeof msg === 'string') {
            const messageNode = document.createElement("div");
            messageNode.textContent = msg;
            return messageNode;
        }
        return msg;
    }

}

@injectable()
export class SingleTextInputDialogProps extends DialogProps {
    readonly confirmButtonLabel?: string;
    readonly initialValue?: string;
    readonly validate?: (input: string) => string;
}

export class SingleTextInputDialog extends AbstractDialog<string> {

    protected readonly inputField: HTMLInputElement;

    constructor(
        @inject(SingleTextInputDialogProps) protected readonly props: SingleTextInputDialogProps
    ) {
        super(props);

        this.inputField = document.createElement("input");
        this.inputField.type = 'text';
        this.inputField.setAttribute('style', 'flex: 0;');
        this.inputField.value = props.initialValue || '';
        this.contentNode.appendChild(this.inputField);

        this.appendAcceptButton(props.confirmButtonLabel);
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

}
