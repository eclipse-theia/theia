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

export const SPLIT_ORIGIN_SESSION_PATH = '/split-origin/session';

export interface RemoteBackend {
    readonly pathname: string;
    readonly origin: string;
    readonly token: string | undefined;
}

export function parseRemoteBackend(search: string = typeof location === 'undefined' ? '' : location.search): RemoteBackend | undefined {
    if (!search) {
        return undefined;
    }
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    const raw = params.get('backend');
    if (!raw) {
        return undefined;
    }
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return undefined;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return undefined;
    }
    return {
        origin: url.origin,
        pathname: url.pathname === '/' ? '' : url.pathname.replace(/\/$/, ''),
        token: params.get('token') || undefined
    };
}
