/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import {interfaces} from 'inversify';
import * as theia from '@theia/plugin';
import {MessageService} from '@theia/core/lib/common/message-service';
import {MessageRegistryMain} from '../../api/plugin-api';
import {ModalNotification, MessageType} from './dialogs/modal-notification';

export class MessageRegistryMainImpl implements MessageRegistryMain {
    private messageService: MessageService;

    constructor(container: interfaces.Container) {
        this.messageService = container.get(MessageService);
    }

    $showInformationMessage(message: string,
                            optionsOrFirstItem: theia.MessageOptions | string | theia.MessageItem,
                            items: string[] | theia.MessageItem[]): PromiseLike<string | theia.MessageItem | undefined> {
        return this.showMessage(MessageType.Info, message, optionsOrFirstItem, ...items);
    }

    $showWarningMessage(message: string,
                        optionsOrFirstItem: theia.MessageOptions | string | theia.MessageItem,
                        items: string[] | theia.MessageItem[]): PromiseLike<string | theia.MessageItem | undefined> {
        return this.showMessage(MessageType.Warning, message, optionsOrFirstItem, ...items);
    }

    $showErrorMessage(message: string,
                      optionsOrFirstItem: theia.MessageOptions | string | theia.MessageItem,
                      items: string[] | theia.MessageItem[]): PromiseLike<string | theia.MessageItem | undefined> {
        return this.showMessage(MessageType.Error, message, optionsOrFirstItem, ...items);
    }

    protected showMessage(type: MessageType, message: string, ...args: any[]): PromiseLike<string | theia.MessageItem | undefined> {
        const actionsMap = new Map<string, any>();
        const actionTitles: string[] = [];
        const options: theia.MessageOptions = {modal: false};

        let onCloseAction: string;
        if (!!args && args.length > 0) {
            const first = args[0];
            if (first && first.modal) {
                options.modal = true;
            }
            args.forEach(arg => {
                if (!arg) {
                    return;
                }
                let actionTitle: string;
                if (typeof arg === 'string') {
                    actionTitle = arg;
                } else if (arg.title) {
                    actionTitle = arg.title;
                    actionsMap.set(actionTitle, arg);
                    if (arg.isCloseAffordance) {
                        onCloseAction = arg.title;
                    }
                } else {
                    return;
                }
                actionTitles.push(actionTitle);
            });
        }

        let promise: Promise<string | undefined>;

        try {
            if (options.modal) {
                const modalNotification = new ModalNotification();
                promise = modalNotification.showDialog(type, message, actionTitles).then(result => {
                    return result !== undefined ? result : onCloseAction;
                });
            } else {
                switch (type) {
                    case MessageType.Info:
                        promise = this.messageService.info(message, ...actionTitles);
                        break;
                    case MessageType.Warning:
                        promise = this.messageService.warn(message, ...actionTitles);
                        break;
                    case MessageType.Error:
                        promise = this.messageService.error(message, ...actionTitles);
                        break;
                    default:
                        return Promise.reject(new Error(`Message type '${type}' is not supported yet!`));
                }
            }
        } catch (e) {
            return Promise.reject(e);
        }

        return Promise.resolve(promise.then(result => !!result && actionsMap.has(result) ? actionsMap.get(result) : result));
    }
}
