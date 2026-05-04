// *****************************************************************************
// Copyright (C) 2026 Satish Shivaji Rao.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Emitter, Event } from '@theia/core/lib/common/event';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { MCPTransport } from '../common/mcp-transport-provider';

/**
 * Adapts the `@modelcontextprotocol/sdk` `Transport` (which uses assignable
 * `onmessage` / `onerror` / `onclose` callback properties) to Theia's
 * {@link MCPTransport} interface (which uses Theia's `Event<T>` shape).
 *
 * This keeps the public {@link MCPTransport} API idiomatic for Theia plugin
 * authors while internal code that already consumes the SDK's `Transport`
 * shape — notably {@link MCPServer} — can continue to do so by reaching
 * through {@link sdkTransport}.
 */
export class SdkTransportAdapter implements MCPTransport {

    readonly kind: string;

    protected readonly messageEmitter = new Emitter<unknown>();
    protected readonly closeEmitter = new Emitter<Error | undefined>();

    constructor(
        readonly sdkTransport: Transport,
        kind: string,
    ) {
        this.kind = kind;
        sdkTransport.onmessage = message => this.messageEmitter.fire(message);
        sdkTransport.onclose = () => this.closeEmitter.fire(undefined);
        sdkTransport.onerror = error => this.closeEmitter.fire(error);
    }

    get onMessage(): Event<unknown> {
        return this.messageEmitter.event;
    }

    get onClose(): Event<Error | undefined> {
        return this.closeEmitter.event;
    }

    send(message: unknown): Promise<void> {
        return this.sdkTransport.send(message as Parameters<Transport['send']>[0]);
    }

    async close(): Promise<void> {
        await this.sdkTransport.close();
        this.messageEmitter.dispose();
        this.closeEmitter.dispose();
    }
}
