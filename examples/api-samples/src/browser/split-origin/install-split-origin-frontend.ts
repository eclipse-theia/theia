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

import { Endpoint } from '@theia/core/lib/browser/endpoint';
import { WebSocketConnectionSource } from '@theia/core/lib/browser/messaging/ws-connection-source';
import { parseRemoteBackend, RemoteBackend, SPLIT_ORIGIN_SESSION_PATH } from '../../common/split-origin/remote-backend';

/**
 * Point {@link Endpoint} at the remote backend and delay Socket.IO until
 * `POST /split-origin/session` has set the connection cookie.
 */
export function installSplitOriginFrontend(): void {
    const remote = parseRemoteBackend();
    if (!remote) {
        return;
    }
    Endpoint.backend = `${remote.origin}${remote.pathname}`;
    patchWebSocketConnectionSource(remote);
    console.info(`[split-origin] frontend patched to use backend ${remote.origin}`);
}

function patchWebSocketConnectionSource(remote: RemoteBackend): void {
    const proto = WebSocketConnectionSource.prototype as unknown as {
        openSocket(): void;
    };

    const originalOpenSocket = proto.openSocket;
    proto.openSocket = function (): void {
        const start = originalOpenSocket.bind(this);
        if (!remote.token) {
            console.error('[split-origin] missing ?token=; refusing to open the backend socket');
            return;
        }
        fetch(`${remote.origin}${remote.pathname}${SPLIT_ORIGIN_SESSION_PATH}`, {
            method: 'POST',
            credentials: 'include',
            mode: 'cors',
            headers: {
                Authorization: `Bearer ${remote.token}`
            }
        }).then(response => {
            if (!response.ok) {
                throw new Error(`session auth failed: HTTP ${response.status}`);
            }
            start();
        }).catch(error => {
            console.error('[split-origin]', error);
        });
    };
}
