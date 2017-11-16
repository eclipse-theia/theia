/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from 'inversify';
import { MessageActionItem, MessageType } from 'vscode-base-languageclient/lib/protocol';
import { Window, OutputChannel } from 'vscode-base-languageclient/lib/services';

@injectable()
export class ConsoleWindow implements Window {
    protected readonly channels = new Map<string, OutputChannel>();
    showMessage<T extends MessageActionItem>(type: MessageType, message: string, ...actions: T[]): Thenable<T | undefined> {
        if (type === MessageType.Error) {
            console.error(message);
        }
        if (type === MessageType.Warning) {
            console.warn(message);
        }
        if (type === MessageType.Info) {
            console.info(message);
        }
        if (type === MessageType.Log) {
            console.log(message);
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
