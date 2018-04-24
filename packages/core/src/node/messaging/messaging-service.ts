
/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { MessageConnection } from "vscode-jsonrpc";
import { IConnection } from "vscode-ws-jsonrpc/lib/server/connection";

export interface MessagingService {
    listen(path: string, callback: (params: MessagingService.Params, connection: MessageConnection) => void): void;
    forward(path: string, callback: (params: MessagingService.Params, connection: IConnection) => void): void;
}
export namespace MessagingService {
    export interface Params {
        [name: string]: string
    }
    export const Contribution = Symbol('MessagingService.Contribution');
    export interface Contribution {
        configure(service: MessagingService): void;
    }
}
