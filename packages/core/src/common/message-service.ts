/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { MessageClient, MessageType } from "./message-service-protocol";

@injectable()
export class MessageService {

    constructor(
        @inject(MessageClient) protected readonly client: MessageClient
    ) { }

    log(message: string, ...actions: string[]): Promise<string | undefined> {
        return this.client.showMessage(MessageType.Log, message, ...actions);
    }

    info(message: string, ...actions: string[]): Promise<string | undefined> {
        return this.client.showMessage(MessageType.Info, message, ...actions);
    }

    warn(message: string, ...actions: string[]): Promise<string | undefined> {
        return this.client.showMessage(MessageType.Warning, message, ...actions);
    }

    error(message: string, ...actions: string[]): Promise<string | undefined> {
        return this.client.showMessage(MessageType.Error, message, ...actions);
    }

}
