// *****************************************************************************
// Copyright (C) 2026 Maksim Kachurin and others.
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
import { Server } from 'socket.io';
import { WebsocketEndpoint } from './websocket-endpoint';
import { BackendApplicationHosts } from '../hosting/backend-application-hosts';

class TestHosts extends BackendApplicationHosts {
    constructor(hosts: string[]) {
        super();
        for (const host of hosts) {
            this._hosts.add(host);
        }
    }
}

class TestWebsocketEndpoint extends WebsocketEndpoint {
    constructor(hosts?: BackendApplicationHosts) {
        super();
        (this as unknown as { backendApplicationHosts?: BackendApplicationHosts }).backendApplicationHosts = hosts;
    }

    options(): NonNullable<ConstructorParameters<typeof Server>[1]> {
        return this.createSocketIoOptions()!;
    }
}

interface TestCors {
    credentials?: boolean;
    origin?: (origin: string | undefined, callback: (err: Error | undefined, result?: boolean) => void) => void;
}

function asCorsOptions(cors: unknown): TestCors {
    if (!cors || typeof cors === 'function') {
        throw new Error('expected CorsOptions');
    }
    return cors as TestCors;
}

function allowOrigin(cors: TestCors, origin: string | undefined): boolean {
    if (typeof cors.origin !== 'function') {
        throw new Error('expected cors.origin to be a function');
    }
    let allowed = false;
    cors.origin(origin, (err, result) => {
        if (err) {
            throw err;
        }
        allowed = !!result;
    });
    return allowed;
}

describe('WebsocketEndpoint Socket.IO CORS', () => {

    it('does not set cors when THEIA_HOSTS is unset', () => {
        expect(new TestWebsocketEndpoint().options().cors).to.equal(undefined);
    });

    it('sets credentials cors when THEIA_HOSTS is set', () => {
        const cors = asCorsOptions(new TestWebsocketEndpoint(new TestHosts(['cdn.example:8080'])).options().cors);
        expect(cors.credentials).to.equal(true);
        expect(allowOrigin(cors, undefined)).to.equal(true);
        expect(allowOrigin(cors, 'http://cdn.example:8080')).to.equal(true);
        expect(allowOrigin(cors, 'http://evil.example')).to.equal(false);
    });

});
