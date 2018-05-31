/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import {injectable} from 'inversify';
import {Message} from '@phosphor/messaging';
import {Key} from '@theia/core/lib/browser';
import {AbstractDialog} from '@theia/core/lib/browser/dialogs';
import '../../../../src/main/browser/dialogs/style/modal-notification.css';

export enum MessageType {
    Error = 'error',
    Warning = 'warning',
    Info = 'info'
}

const NOTIFICATION = 'theia-Notification';
const ICON = 'icon';
const TEXT = 'text';

@injectable()
export class ModalNotification extends AbstractDialog<string | undefined> {

    protected actionTitle: string | undefined;

    constructor() {
        super({title: 'Theia'});
    }

    protected onCloseRequest(msg: Message): void {
        this.actionTitle = undefined;
        this.accept();
    }

    get value(): string | undefined {
        return this.actionTitle;
    }

    showDialog(messageType: MessageType, text: string, actions: string[]): Promise<string | undefined> {
        this.contentNode.appendChild(this.createMessageNode(messageType, text, actions));
        return this.open();
    }

    protected createMessageNode(messageType: MessageType, text: string, actions: string[]): HTMLElement {
        const messageNode = document.createElement('div');
        messageNode.classList.add(NOTIFICATION);

        const iconContainer = messageNode.appendChild(document.createElement('div'));
        iconContainer.classList.add(ICON);
        const iconElement = iconContainer.appendChild(document.createElement('i'));
        iconElement.classList.add('fa', this.toIconClass(messageType), 'fa-fw', messageType.toString());

        const textContainer = messageNode.appendChild(document.createElement('div'));
        textContainer.classList.add(TEXT);
        const textElement = textContainer.appendChild(document.createElement('span'));
        textElement.textContent = text;

        actions.forEach((action: string) => {
            const button = this.createButton(action);
            button.classList.add('main');
            this.controlPanel.appendChild(button);
            this.addKeyListener(button,
                Key.ENTER,
                () => {
                    this.actionTitle = action;
                    this.accept();
                },
                'click');
        });
        this.appendCloseButton('close');

        return messageNode;
    }

    protected toIconClass(icon: MessageType): string {
        if (icon === MessageType.Error) {
            return 'fa-times-circle';
        }
        if (icon === MessageType.Warning) {
            return 'fa-warning';
        }
        return 'fa-info-circle';
    }
}
