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

import { interfaces } from '@theia/core/shared/inversify';
import { MessageService } from '@theia/core/lib/common/message-service';
import { MessageRegistryMain, MainMessageType, MainMessageOptions, MainMessageItem } from '../../common/plugin-api-rpc';
import { ModalNotification, MessageType } from './dialogs/modal-notification';

export class MessageRegistryMainImpl implements MessageRegistryMain {
    private readonly messageService: MessageService;

    constructor(container: interfaces.Container) {
        this.messageService = container.get(MessageService);
    }

    async $showMessage(type: MainMessageType, message: string, options: MainMessageOptions, actions: MainMessageItem[]): Promise<number | undefined> {
        const action = await this.doShowMessage(type, message, options, actions);
        const handle = action
            ? actions.map(a => a.title).indexOf(action)
            : undefined;
        return handle === undefined && options.modal ? options.onCloseActionHandle : handle;
    }

    protected async doShowMessage(type: MainMessageType, message: string, options: MainMessageOptions, actions: MainMessageItem[]): Promise<string | undefined> {
        if (options.modal) {
            const messageType = type === MainMessageType.Error ? MessageType.Error :
                type === MainMessageType.Warning ? MessageType.Warning :
                    MessageType.Info;
            const modalNotification = new ModalNotification();
            return modalNotification.showDialog(messageType, message, actions);
        }
        switch (type) {
            case MainMessageType.Info:
                return this.messageService.info(message, ...actions.map(a => a.title));
            case MainMessageType.Warning:
                return this.messageService.warn(message, ...actions.map(a => a.title));
            case MainMessageType.Error:
                return this.messageService.error(message, ...actions.map(a => a.title));
        }
        throw new Error(`Message type '${type}' is not supported yet!`);
    }

}
