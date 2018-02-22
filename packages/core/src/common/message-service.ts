/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { MessageClient, MessageType, MessageOptions } from "./message-service-protocol";

@injectable()
export class MessageService {

    constructor(
        @inject(MessageClient) protected readonly client: MessageClient
    ) { }

    log(message: string, ...actions: string[]): Promise<string | undefined>;
    log(message: string, options?: MessageOptions, ...actions: string[]): Promise<string | undefined>;
    // tslint:disable-next-line:no-any
    log(message: string, ...args: any[]): Promise<string | undefined> {
        return this.processMessage(MessageType.Log, message, args);
    }

    info(message: string, ...actions: string[]): Promise<string | undefined>;
    info(message: string, options?: MessageOptions, ...actions: string[]): Promise<string | undefined>;
    // tslint:disable-next-line:no-any
    info(message: string, ...args: any[]): Promise<string | undefined> {
        return this.processMessage(MessageType.Info, message, args);
    }

    warn(message: string, ...actions: string[]): Promise<string | undefined>;
    warn(message: string, options?: MessageOptions, ...actions: string[]): Promise<string | undefined>;
    // tslint:disable-next-line:no-any
    warn(message: string, ...args: any[]): Promise<string | undefined> {
        return this.processMessage(MessageType.Warning, message, args);
    }

    error(message: string, ...actions: string[]): Promise<string | undefined>;
    error(message: string, options?: MessageOptions, ...actions: string[]): Promise<string | undefined>;
    // tslint:disable-next-line:no-any
    error(message: string, ...args: any[]): Promise<string | undefined> {
        return this.processMessage(MessageType.Error, message, args);
    }

    // tslint:disable-next-line:no-any
    protected processMessage(type: MessageType, text: string, args?: any[]): Promise<string | undefined> {
        if (!!args && args.length > 0) {
            const first = args[0];
            const actions: string[] = args.filter(a => typeof a === 'string');
            const options = (typeof first === 'object' && !Array.isArray(first))
                ? <MessageOptions>first
                : undefined;
            return this.client.showMessage({ type, options, text, actions });
        }
        return this.client.showMessage({ type, text });
    }

}
