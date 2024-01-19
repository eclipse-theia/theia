// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { interfaces } from '@theia/core/shared/inversify';
import { MainMessageType, MainMessageOptions, MainMessageItem } from '../../common/plugin-api-rpc';
import { ModalNotification, MessageType } from './dialogs/modal-notification';
import { BasicMessageRegistryMainImpl } from '../common/basic-message-registry-main';

/**
 * Message registry implementation that adds support for the model option via dialog in the browser.
 */
export class MessageRegistryMainImpl extends BasicMessageRegistryMainImpl {
    constructor(container: interfaces.Container) {
        super(container);
    }

    protected override async doShowMessage(type: MainMessageType, message: string,
        options: MainMessageOptions, actions: MainMessageItem[]): Promise<string | undefined> {

        if (options.modal) {
            const messageType = type === MainMessageType.Error ? MessageType.Error :
                type === MainMessageType.Warning ? MessageType.Warning :
                    MessageType.Info;
            const modalNotification = new ModalNotification();
            return modalNotification.showDialog(messageType, message, options, actions);
        }
        return super.doShowMessage(type, message, options, actions);
    }

}
