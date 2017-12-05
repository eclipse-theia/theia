/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { MessageService } from '@theia/core/lib/common';
import { MessageActionItem, MessageType } from 'vscode-base-languageclient/lib/protocol';
import { Window, OutputChannel } from 'vscode-base-languageclient/lib/services';

@injectable()
export class WindowImpl implements Window {
    protected readonly channels = new Map<string, OutputChannel>();
    constructor( @inject(MessageService) protected readonly messageService: MessageService) { }
    showMessage<T extends MessageActionItem>(type: MessageType, message: string, ...actions: T[]): Thenable<T | undefined> {
        const originalActions = new Map((actions || []).map(action => [action.title, action] as [string, T]));
        const actionTitles = (actions || []).map(action => action.title);
        const mapActionType: (result: string | undefined) => (T | undefined) = result => {
            if (!!result) {
                return originalActions.get(result);
            }
            return undefined;
        };
        if (type === MessageType.Error) {
            return this.messageService.error(message, ...actionTitles).then(mapActionType);
        }
        if (type === MessageType.Warning) {
            return this.messageService.warn(message, ...actionTitles).then(mapActionType);
        }
        if (type === MessageType.Info) {
            return this.messageService.info(message, ...actionTitles).then(mapActionType);
        }
        if (type === MessageType.Log) {
            return this.messageService.log(message, ...actionTitles).then(mapActionType);
        }
        return Promise.resolve(undefined);
    }
    createOutputChannel(name: string): OutputChannel {
        const existing = this.channels.get(name);
        if (existing) {
            return existing;
        }
        const channel: OutputChannel = {
            append(value: string): void {
                console.log(name + ': ' + value);
            },
            appendLine(line: string): void {
                console.log(name + ': ' + line);
            },
            show(): void {
                // no-op
            }
        };
        this.channels.set(name, channel);
        return channel;
    }
}
