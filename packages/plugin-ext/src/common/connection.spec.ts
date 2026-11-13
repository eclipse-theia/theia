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
import { Deferred } from '@theia/core/lib/common/promise-util';
import { ConnectionImpl, PluginChannel } from './connection.js';
import { ConnectionExt } from './plugin-api-rpc.js';

describe('ConnectionImpl', () => {
    let proxy: ConnectionExt;
    let connection: ConnectionImpl;
    let remoteCreates: string[];
    let remoteDeletes: string[];

    beforeEach(() => {
        remoteCreates = [];
        remoteDeletes = [];
        proxy = {
            $createConnection: async id => { remoteCreates.push(id); },
            $deleteConnection: async id => { remoteDeletes.push(id); },
            $sendMessage: () => { }
        };
        connection = new ConnectionImpl(proxy);
    });

    afterEach(() => connection.dispose());

    it('closes every channel once without contacting the disposed peer', async () => {
        const first = await connection.ensureConnection('first');
        const second = await connection.ensureConnection('second');
        const closed: string[] = [];
        first.onClose(() => {
            closed.push('first');
            connection.dispose();
        });
        second.onClose(() => closed.push('second'));

        connection.dispose();
        connection.dispose();
        await connection.$deleteConnection('first');
        await connection.$deleteConnection('second');

        assert.deepEqual(closed, ['first', 'second']);
        assert.deepEqual(remoteDeletes, []);
    });

    it('does not notify a deleted channel again during disposal', async () => {
        const channel = await connection.ensureConnection('session');
        let closes = 0;
        channel.onClose(() => closes++);
        await connection.$deleteConnection('session');
        connection.dispose();
        assert.equal(closes, 1);
    });

    it('rejects local and remote channel creation after disposal', async () => {
        connection.dispose();
        await assert.rejects(connection.ensureConnection('local'), /disposed/);
        await assert.rejects(connection.$createConnection('remote'), /disposed/);
        await assert.rejects(connection.doEnsureConnection('direct'), /disposed/);
        assert.deepEqual(remoteCreates, []);
    });

    it('closes a channel whose creation finishes after disposal', async () => {
        const created = new Deferred<PluginChannel>();
        class DelayedConnection extends ConnectionImpl {
            protected override doCreateConnection(): Promise<PluginChannel> {
                return created.promise;
            }
        }
        connection = new DelayedConnection(proxy);
        const channel = new PluginChannel('session', proxy);
        let closes = 0;
        channel.onClose(() => closes++);
        const pending = connection.ensureConnection('session');
        const rejected = assert.rejects(pending, /disposed/);

        connection.dispose();
        created.resolve(channel);
        await rejected;
        assert.equal(closes, 1);
        assert.deepEqual(remoteCreates, []);
        assert.deepEqual(remoteDeletes, []);
    });

    it('rejects a pending remote creation when the connection is disposed', async () => {
        const started = new Deferred<void>();
        const acknowledged = new Deferred<void>();
        proxy.$createConnection = async () => {
            started.resolve();
            await acknowledged.promise;
        };
        const channel = await connection.doEnsureConnection('session');
        let closes = 0;
        channel.onClose(() => closes++);
        const pending = connection.ensureConnection('session');
        const rejected = assert.rejects(pending, /disposed/);
        await started.promise;

        connection.dispose();
        acknowledged.resolve();
        await rejected;
        assert.equal(closes, 1);
    });

    it('releases channel listeners when closed', async () => {
        const channel = await connection.ensureConnection('session');
        let messages = 0;
        let errors = 0;
        let closes = 0;
        channel.onMessage(() => messages++);
        channel.onError(() => errors++);
        channel.onClose(() => closes++);

        connection.dispose();
        channel.fireMessageReceived('late message');
        channel.fireError(new Error('late error'));
        channel.fireClosed();

        assert.equal(messages, 0);
        assert.equal(errors, 0);
        assert.equal(closes, 1);
    });
});
