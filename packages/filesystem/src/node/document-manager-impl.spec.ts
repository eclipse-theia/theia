/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as assert from "assert";
import { Container } from "inversify";
import { Emitter } from "@theia/core";
import { ReconnectingDocumentManager, DocumentManagerProxy, DocumentManager } from "../common";
import { DocumentManagerImpl } from "./document-manager-impl";

export interface MockDocumentManagerProxy extends DocumentManagerProxy {
    readonly connected: boolean;
    connect(): void;
    disconnect(): void;
}

describe('ReconnectingDocumentManager', () => {

    const fooUri = 'inmemory://Foo.txt';

    let proxy: MockDocumentManagerProxy;
    let manager: DocumentManager;
    beforeEach(() => {
        const container = new Container({ defaultScope: 'Singleton' });
        container.bind(DocumentManagerImpl).toSelf();
        container.bind<MockDocumentManagerProxy>(DocumentManagerProxy).toDynamicValue(() => {
            const impl = container.get(DocumentManagerImpl);
            const onDidOpenConnectionEmitter = new Emitter<void>();
            const onDidCloseConnectionEmitter = new Emitter<void>();

            let connected = false;
            onDidOpenConnectionEmitter.event(() => connected = true);
            onDidCloseConnectionEmitter.event(() => connected = false);
            async function stub<T>(fn: () => Promise<T>): Promise<T> {
                if (!connected) {
                    throw new Error('disconnected');
                }
                return fn();
            }
            return {
                connected,
                connect: () => onDidOpenConnectionEmitter.fire(undefined),
                disconnect: () => onDidCloseConnectionEmitter.fire(undefined),
                onDidOpenConnection: onDidOpenConnectionEmitter.event,
                onDidCloseConnection: onDidCloseConnectionEmitter.event,
                dispose: () => {
                    impl.dispose();
                    onDidOpenConnectionEmitter.dispose();
                    onDidCloseConnectionEmitter.dispose();
                },
                setClient: () => { },
                open: uri => stub(() => impl.open(uri)),
                read: uri => stub(() => impl.read(uri)),
                update: (uri, changes) => stub(() => impl.update(uri, changes)),
                save: uri => stub(() => impl.save(uri)),
                close: uri => stub(() => impl.close(uri))
            };
        });
        container.bind(ReconnectingDocumentManager).toSelf();
        proxy = container.get(DocumentManagerProxy);
        manager = container.get(ReconnectingDocumentManager);
    });

    afterEach(() => {
        manager.dispose();
    });

    it('reopen on reconnect', async () => {
        manager.setClient({
            onDidChange: () => assert.fail('First connection should be skipped')
        });
        proxy.connect();
        await manager.open(fooUri);
        proxy.disconnect();

        const reopenedUri = new Promise(resolve => manager.setClient({
            onDidChange: uri => {
                manager.setClient(undefined);
                resolve(uri);
            }
        }));
        proxy.connect();
        assert.equal(fooUri, await reopenedUri);
    });

    it('update on reconnect', async () => {
        proxy.connect();
        await manager.open(fooUri);
        proxy.disconnect();

        manager.update(fooUri, [{ text: 'Hello World' }]);
        manager.update(fooUri, [{ text: 'Hello Anton' }]);

        proxy.connect();
        assert.equal('Hello Anton', await manager.read(fooUri));
    });

    it('update on reconnect 2', async () => {
        proxy.connect();
        await manager.open(fooUri);
        proxy.disconnect();

        manager.update(fooUri, [{
            text: `/// <reference path="moduleNameResolver.ts"/>
/// <reference path="binder.ts"/>
/// <reference path="symbolWalker.ts" />

namespace ts2 {
    let nextSymbolId = 1;
    let nextNodeId = 1;
    let nextNodeeId = 1;
    let nextFlowId = 1;
}` }]);
        await manager.update(fooUri, [{
            "text": `
    let nextSymbolId = 1;
    let nextNodeId = 1;
    let nextNodeeId = 1;
    let nextFlowId = 1;`,
            "range": {
                "start": {
                    "line": 8,
                    "character": 23
                },
                "end": {
                    "line": 8,
                    "character": 23
                }
            },
            "rangeLength": 0
        }]);

        proxy.connect();
        manager.update(fooUri, [{
            "text": "2",
            "range": {
                "start": {
                    "line": 8,
                    "character": 18
                },
                "end": {
                    "line": 8,
                    "character": 18
                }
            },
            "rangeLength": 0
        }]);
        assert.equal(`/// <reference path="moduleNameResolver.ts"/>
/// <reference path="binder.ts"/>
/// <reference path="symbolWalker.ts" />

namespace ts2 {
    let nextSymbolId = 1;
    let nextNodeId = 1;
    let nextNodeeId = 1;
    let nextFlowId2 = 1;
    let nextSymbolId = 1;
    let nextNodeId = 1;
    let nextNodeeId = 1;
    let nextFlowId = 1;
}`, await manager.read(fooUri));
    });

});
