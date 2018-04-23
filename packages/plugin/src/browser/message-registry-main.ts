/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import {interfaces} from 'inversify';
import {MessageRegistryMain} from '../api/plugin-api';
import {MessageItem, MessageOptions} from "@theia/plugin";
import {MessageService} from '@theia/core/lib/common/message-service';

export enum MessageType {
    Error = 1,
    Warning,
    Info
}

export class MessageRegistryMainImpl implements MessageRegistryMain {
    private delegate: MessageService;

    constructor(container: interfaces.Container) {
        this.delegate = container.get(MessageService);
    }

    $showInformationMessage (message: string,
        optionsOrFirstItem: MessageOptions | string | MessageItem,
        items: string[] | MessageItem[]): PromiseLike<string | MessageItem | undefined> {
        return this.showMessage(MessageType.Info, message, optionsOrFirstItem, ...items);
    }

    $showWarningMessage (message: string,
                             optionsOrFirstItem: MessageOptions | string | MessageItem,
                             items: string[] | MessageItem[]): PromiseLike<string | MessageItem | undefined> {
        return this.showMessage(MessageType.Warning, message, optionsOrFirstItem, ...items);
    }

    $showErrorMessage (message: string,
                             optionsOrFirstItem: MessageOptions | string | MessageItem,
                             items: string[] | MessageItem[]): PromiseLike<string | MessageItem | undefined> {
        return this.showMessage(MessageType.Error, message, optionsOrFirstItem, ...items);
    }

    protected showMessage(type: MessageType, message: string, ...args: any[]): PromiseLike<string | MessageItem | undefined> {
        const actionsMap = new Map<string, any>();
        const actionTitles: string[] = [];

        let options: MessageOptions | undefined;
        if (!!args && args.length > 0) {
            const first = args[0];
            options = first && first.modal !== undefined ? <MessageOptions>first : undefined;
            args.forEach(arg => {
                if (!arg) {
                    return;
                }
                let actionTitle: string;
                if (typeof arg === 'string') {
                    actionTitle = arg;
                } else if (arg !== options && arg.title) {
                    actionTitle = <string>arg.title;
                    actionsMap.set(actionTitle, arg);
                } else {
                    return;
                }
                actionTitles.push(actionTitle);
            });
        }

        if (options && options.modal === true) {
            return Promise.reject(new Error('Modal message is not supported yet!'));
        }

        let promise: Promise<string | undefined>;

        try {
            switch (type) {
                case MessageType.Info:
                    promise = this.delegate.info(message, ...actionTitles);
                    break;
                case MessageType.Warning:
                    promise = this.delegate.warn(message, ...actionTitles);
                    break;
                case MessageType.Error:
                    promise = this.delegate.error(message, ...actionTitles);
                    break;
                default:
                    return Promise.reject(new Error(`Message type '${type}' is not supported yet!`));
            }
        } catch (e) {
            return Promise.reject(e);
        }

        return Promise.resolve(promise.then(result => !!result && actionsMap.has(result) ? actionsMap.get(result) : result));
    }
}
