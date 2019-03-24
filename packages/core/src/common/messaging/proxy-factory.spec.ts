/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import * as chai from 'chai';
import { ConsoleLogger } from '../../node/messaging/logger';
import { JsonRpcProxyFactory } from './proxy-factory';
import { createMessageConnection } from 'vscode-jsonrpc/lib/main';
import * as stream from 'stream';

const expect = chai.expect;

class NoTransform extends stream.Transform {

    // tslint:disable-next-line:no-any
    public _transform(chunk: any, encoding: string, callback: Function): void {
        callback(undefined, chunk);
    }
}

class TestServer {
    requests: string[] = [];
    doStuff(arg: string): Promise<string> {
        this.requests.push(arg);
        return Promise.resolve(`done: ${arg}`);
    }

    fails(arg: string, otherArg: string): Promise<string> {
        throw new Error('fails failed');
    }

    fails2(arg: string, otherArg: string): Promise<string> {
        return Promise.reject(new Error('fails2 failed'));
    }
}

class TestClient {
    notifications: string[] = [];
    notifyThat(arg: string): void {
        this.notifications.push(arg);
    }
}

describe('Proxy-Factory', () => {

    it('Should correctly send notifications and requests.', done => {
        const it = getSetup();
        it.clientProxy.notifyThat('hello');
        function check() {
            if (it.client.notifications.length === 0) {
                console.log('waiting another 50 ms');
                setTimeout(check, 50);
            } else {
                expect(it.client.notifications[0]).eq('hello');
                it.serverProxy.doStuff('foo').then(result => {
                    expect(result).to.be.eq('done: foo');
                    done();
                });
            }
        }
        check();
    });
    it('Rejected Promise should result in rejected Promise.', done => {
        const it = getSetup();
        const handle = setTimeout(() => done('timeout'), 500);
        it.serverProxy.fails('a', 'b').catch(err => {
            expect(<Error>err.message).to.contain('fails failed');
            clearTimeout(handle);
            done();
        });
    });
    it('Remote Exceptions should result in rejected Promise.', done => {
        const { serverProxy } = getSetup();
        const handle = setTimeout(() => done('timeout'), 500);
        serverProxy.fails2('a', 'b').catch(err => {
            expect(<Error>err.message).to.contain('fails2 failed');
            clearTimeout(handle);
            done();
        });
    });
});

function getSetup() {
    const client = new TestClient();
    const server = new TestServer();

    const serverProxyFactory = new JsonRpcProxyFactory<TestServer>(client);
    const client2server = new NoTransform();
    const server2client = new NoTransform();
    const serverConnection = createMessageConnection(server2client, client2server, new ConsoleLogger());
    serverProxyFactory.listen(serverConnection);
    const serverProxy = serverProxyFactory.createProxy();

    const clientProxyFactory = new JsonRpcProxyFactory<TestClient>(server);
    const clientConnection = createMessageConnection(client2server, server2client, new ConsoleLogger());
    clientProxyFactory.listen(clientConnection);
    const clientProxy = clientProxyFactory.createProxy();
    return {
        client,
        clientProxy,
        server,
        serverProxy
    };
}
