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
import { DebugSessionPath } from "../common/debug-model";
import { DebugProtocol } from "vscode-debugprotocol";

export interface DebugClient {
    sendRequest(request: DebugProtocol.Request): void;
}

export class BaseDebugClient implements DebugClient {
    constructor(
        protected readonly connectionProvider: WebSocketConnectionProvider,
        protected readonly sessionId: string) { }

    sendRequest(request: DebugProtocol.Request): void {
        this.connectionProvider.listen({
            path: DebugSessionPath + "/" + this.sessionId,
            onConnection: messageConnection => {
                messageConnection.onRequest("test", (...args) => this.onRequest("test", ...args));
                messageConnection.onNotification("test", (...args) => this.onNotification("test", ...args));
                messageConnection.listen();

                const resultPromise = messageConnection.sendRequest("test", JSON.stringify({ command: "response", success: true, seq: "0", type: "" }));
                resultPromise.then(response => { });
            }
        },
            { reconnecting: false }
        );
    }

    protected async onRequest(method: string, ...args: any[]): Promise<any> { }

    protected onNotification(method: string, ...args: any[]): void { }
}

@injectable()
export class DebugClientFactory {
    constructor(
        @inject(WebSocketConnectionProvider)
        protected readonly connectionProvider: WebSocketConnectionProvider
    ) { }

    get(sessionId: string): DebugClient {
        return new BaseDebugClient(this.connectionProvider, sessionId);
    }
}
