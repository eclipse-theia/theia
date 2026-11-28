// *****************************************************************************
// Copyright (C) 2026 Swarneil Pradhan and others.
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

import { strict as assert } from 'assert';
import { BasicChannel } from '@theia/core/lib/common/message-rpc/channel';
import { Uint8ArrayWriteBuffer } from '@theia/core/lib/common/message-rpc/uint8-array-message-buffer';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { DebugSessionConnection } from '@theia/debug/lib/browser/debug-session-connection';
import { ConnectionImpl } from '../../common/connection.js';
import { PLUGIN_RPC_CONTEXT } from '../../common/plugin-api-rpc.js';
import { RPCProtocolImpl } from '../../common/rpc-protocol.js';

describe('Plugin debug connection RPC disposal', () => {
    it('closes the session and rejects a pending debug request', async () => {
        const transport = new BasicChannel(() => new Uint8ArrayWriteBuffer());
        const rpc = new RPCProtocolImpl(transport);
        const sent = new Deferred<void>();
        const connection = rpc.set(PLUGIN_RPC_CONTEXT.CONNECTION_MAIN, new ConnectionImpl({
            $createConnection: async () => { },
            $deleteConnection: async () => { assert.fail('disposed RPC must not send a delete request'); },
            $sendMessage: () => { sent.resolve(); }
        }));
        const session = new DebugSessionConnection('session', id => connection.ensureConnection(id), undefined);
        let closes = 0;
        session.onDidClose(() => closes++);
        try {
            const pending = session.sendRequest('threads', {});
            const rejected = assert.rejects(pending, /cancelled on connection close/);
            await sent.promise;

            rpc.dispose();
            rpc.dispose();

            assert.equal(session.closed, true);
            assert.equal(closes, 1);
            await rejected;
            await assert.rejects(session.sendRequest('threads', {}), /Connection is closed/);
        } finally {
            rpc.dispose();
            session.dispose();
            transport.close();
        }
    });
});
