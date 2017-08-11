/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";

export const messageServicePath = '/services/messageService';

export enum MessageType {
    Error = 1,
    Warning = 2,
    Info = 3,
    Log = 4
}

export const MessageClient = Symbol('MessageClient');
export interface MessageClient {
    /**
     * Show a message of the given type and possible actions to the user.
     * Resolve to a chosen action.
     * Never reject.
     */
    showMessage(type: MessageType, message: string, ...actions: string[]): Promise<string | undefined>;
}

@injectable()
export class DispatchingMessageClient implements MessageClient {

    readonly clients = new Set<MessageClient>();

    showMessage(type: MessageType, message: string, ...actions: string[]): Promise<string | undefined> {
        return Promise.race([...this.clients].map(service =>
            service.showMessage(type, message, ...actions)
        ));
    }

}
