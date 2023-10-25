// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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

import { injectable } from 'inversify';
import { WebSocketConnectionProvider } from '../../browser/messaging/ws-connection-provider';
import { Endpoint } from '../../browser/endpoint';

export function getLocalPort(): string | undefined {
    const params = new URLSearchParams(location.search);
    return params.get('localPort') ?? undefined;
}

@injectable()
export class ElectronLocalWebSocketConnectionProvider extends WebSocketConnectionProvider {

    protected override createEndpoint(path: string): Endpoint {
        const localPort = getLocalPort();
        if (!localPort) {
            throw new Error('This should only be called in case there is a local port specified!');
        }
        const endpoint = new Endpoint({
            path
        }, {
            host: `localhost:${localPort}`,
            pathname: '/',
            protocol: 'http',
            search: ''
        });
        return endpoint;
    }

}
