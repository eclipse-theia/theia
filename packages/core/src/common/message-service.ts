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

    log(message: string, options?: MessageOptions): Promise<string | undefined> {
        return this.processMessage(MessageType.Log, message, options);
    }

    info(message: string, options?: MessageOptions): Promise<string | undefined> {
        return this.processMessage(MessageType.Info, message, options);
    }

    warn(message: string, options?: MessageOptions): Promise<string | undefined> {
        return this.processMessage(MessageType.Warning, message, options);
    }

    error(message: string, options?: MessageOptions): Promise<string | undefined> {
        return this.processMessage(MessageType.Error, message, options);
    }

    private processMessage(messageType: MessageType, messageText: string, options: MessageOptions | undefined): Promise<string | undefined> {
        if (options) {
            return this.client.showMessage(
                { type: messageType, text: messageText, options: { timeout: options.timeout, actions: options.actions } });
        }
        return this.client.showMessage({ type: messageType, text: messageText });
    }
}
