// *****************************************************************************
// Copyright (C) 2026 Safi Seid-Ahmad, K2view and others.
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

import { expect } from 'chai';
import { CommandRegistryMain } from '../common/plugin-api-rpc.js';
import { RPCProtocol } from '../common/rpc-protocol.js';
import { CommandRegistryImpl } from './command-registry.js';
import { URI } from './types-impl.js';

describe('CommandRegistryImpl', () => {

    const commandId = 'test.command';
    // The JSON form of a file URI whose `fsPath` was computed on a Windows client.
    const windowsClientUri = {
        $mid: 1,
        scheme: 'file',
        path: '/home/project/folder',
        fsPath: '\\home\\project\\folder',
        _sep: 1,
        external: 'file:///home/project/folder'
    };
    const expectedFsPath = URI.file('/home/project/folder').fsPath;

    let registry: CommandRegistryImpl;
    let received: unknown[];

    beforeEach(() => {
        const proxy = new Proxy({}, { get: () => (): void => { } }) as CommandRegistryMain;
        registry = new CommandRegistryImpl({ getProxy: () => proxy } as unknown as RPCProtocol);
        received = [];
        registry.registerCommand({ id: commandId }, (...args: unknown[]) => {
            received = args;
            return Promise.resolve(undefined);
        });
    });

    it('revives a URI argument', async () => {
        await registry.$executeCommand(commandId, windowsClientUri);
        expect(received[0]).instanceOf(URI);
        expect((received[0] as URI).fsPath).equal(expectedFsPath);
    });

    it('revives URIs in an array argument', async () => {
        await registry.$executeCommand(commandId, windowsClientUri, [windowsClientUri, { ...windowsClientUri, path: '/home/project/file.txt' }]);
        const uris = received[1] as URI[];
        expect(uris).length(2);
        uris.forEach(uri => expect(uri).instanceOf(URI));
        expect(uris[0].fsPath).equal(expectedFsPath);
        expect(uris[1].path).equal('/home/project/file.txt');
    });

    it('keeps other arguments', async () => {
        const object = { scheme: 'not a uri' };
        await registry.$executeCommand(commandId, 'text', 1, object, ['text', object]);
        expect(received).deep.equal(['text', 1, object, ['text', object]]);
        expect(received[2]).equal(object);
    });
});
