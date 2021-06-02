/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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
import { injectable } from '@theia/core/shared/inversify';
import { Message } from '@theia/core/shared/@phosphor/messaging';
import { Key } from '@theia/core/lib/browser';
import { AbstractDialog } from '@theia/core/lib/browser/dialogs';
import '../../../../src/main/browser/dialogs/style/modal-notification.css';
import { MainMessageItem } from '../../../common/plugin-api-rpc';

export enum MessageType {
    Error = 'error',
    Warning = 'warning',
    Info = 'info'
}

const NOTIFICATION = 'modal-Notification';
const ICON = 'icon';
const TEXT = 'text';

@injectable()
export class ModalNotification extends AbstractDialog<string | undefined> {

    protected actionTitle: string | undefined;

    constructor() {
        super({ title: 'Theia' });
    }

    protected onCloseRequest(msg: Message): void {
        this.actionTitle = undefined;
        this.accept();
    }

    get value(): string | undefined {
        return this.actionTitle;
    }

    showDialog(messageType: MessageType, text: string, actions: MainMessageItem[]): Promise<string | undefined> {
        this.contentNode.appendChild(this.createMessageNode(messageType, text, actions));
        return this.open();
    }

    protected createMessageNode(messageType: MessageType, text: string, actions: MainMessageItem[]): HTMLElement {
        const messageNode = document.createElement('div');
        messageNode.classList.add(NOTIFICATION);

        const iconContainer = messageNode.appendChild(document.createElement('div'));
        iconContainer.classList.add(ICON);
        const iconElement = iconContainer.appendChild(document.createElement('i'));
        iconElement.classList.add('fa', this.toIconClass(messageType), 'fa-fw', messageType.toString());

        const textContainer = messageNode.appendChild(document.createElement('div'));
        textContainer.classList.add(TEXT);
        const textElement = textContainer.appendChild(document.createElement('p'));
        textElement.textContent = text;

        actions.forEach((action: MainMessageItem) => {
            const button = this.createButton(action.title);
            button.classList.add('main');
            this.controlPanel.appendChild(button);
            this.addKeyListener(button,
                Key.ENTER,
                () => {
                    this.actionTitle = action.title;
                    this.accept();
                },
                'click');
        });
        if (!actions.some(action => action.isCloseAffordance === true)) {
            this.appendCloseButton('close');
        }

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
