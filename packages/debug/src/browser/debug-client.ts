/*
 * Copyright (C) 2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

import { injectable, inject } from "inversify";
import { WebSocketConnectionProvider } from "@theia/core/lib/browser";
import { IConnectionProvider } from "@theia/languages/lib/common";
import {
    ConnectionErrorHandler,
    ConnectionCloseHandler,
    createConnection
} from "vscode-base-languageclient/lib/connection";
import { DebugSessionPath } from "../common/debug-model";
import { DebugProtocol } from "vscode-debugprotocol/lib/debugProtocol";

export interface DebugClient {
    sendRequest(request: DebugProtocol.Request): DebugProtocol.Response;
}

export class BaseDebugClient implements DebugClient {
    constructor(protected readonly connectionProvider: IConnectionProvider) { }

    sendRequest(request: DebugProtocol.Request): DebugProtocol.Response {
        return { command: "", request_seq: -1, success: true, seq: -1, type: "" };
    }
}

@injectable()
export class DebugClientFactory {
    constructor(
        @inject(WebSocketConnectionProvider)
        protected readonly connectionProvider: WebSocketConnectionProvider
    ) { }

    get(sessionId: string): DebugClient {
        return new BaseDebugClient({
            get: (errorHandler: ConnectionErrorHandler, closeHandler: ConnectionCloseHandler) =>
                new Promise(resolve => {
                    this.connectionProvider.listen({
                        path: DebugSessionPath + "/" + sessionId,
                        onConnection: messageConnection => {
                            const connection = createConnection(messageConnection, errorHandler, closeHandler);
                            resolve(connection);
                        }
                    }, { reconnecting: false }
                    );
                })
        });
    }
}
