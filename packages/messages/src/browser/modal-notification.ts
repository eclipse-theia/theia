/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import {injectable, inject} from 'inversify';
import {Message} from '@phosphor/messaging';
import {AbstractDialog} from '@theia/core/lib/browser/dialogs';
import {NOTIFICATION, ICON, TEXT, Notification, NotificationProperties, NotificationAction} from './notifications';

@injectable()
export class ModalNotificationsProps implements NotificationProperties {
    icon: string;
    text: string;
    actions?: NotificationAction[];
    timeout: number | undefined;
}

export class ModalNotification extends AbstractDialog<boolean> {

    protected confirmed = true;

    constructor(@inject(ModalNotificationsProps) protected readonly properties: ModalNotificationsProps) {
        super({title: 'Theia'});
        this.contentNode.appendChild(this.createMessageNode(properties));
    }

    protected onCloseRequest(msg: Message): void {
        this.confirmed = false;
        this.accept();
    }

    get value(): boolean {
        return this.confirmed;
    }

    protected createMessageNode(properties: NotificationProperties): HTMLElement {
        const messageNode = document.createElement('div');
        messageNode.classList.add(NOTIFICATION);

        const iconContainer = messageNode.appendChild(document.createElement('div'));
        iconContainer.classList.add(ICON);
        const icon = iconContainer.appendChild(document.createElement('i'));
        icon.classList.add('fa', this.toIconClass(properties.icon), 'fa-fw', properties.icon);

        const textContainer = messageNode.appendChild(document.createElement('div'));
        textContainer.textContent = properties.text;
        textContainer.classList.add(TEXT);

        if (!properties.actions) {
            this.appendCloseButton();
            return messageNode;
        }

        const handler = <Notification>{element: messageNode, properties};

        properties.actions.forEach((action: NotificationAction) => {
            const button = this.createButton(action.label);
            button.classList.add(this.toButtonClass(action));
            this.controlPanel.appendChild(button);
            button.addEventListener('click', () => {
                action.fn(handler);
            });

            this.addAcceptAction(button, 'click');
        });

        return messageNode;
    }

    protected toIconClass(icon: string): string {
        if (icon === 'error') {
            return 'fa-times-circle';
        }
        if (icon === 'warning') {
            return 'fa-warning';
        }
        return 'fa-info-circle';
    }

    protected toButtonClass(action: NotificationAction): string {
        const label = action.label.toLowerCase();
        if (label === 'close' || label === 'cancel') {
            return 'secondary';
        }
        return 'main';
    }
}
