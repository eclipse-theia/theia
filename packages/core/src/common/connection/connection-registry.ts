// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { DisposableCollection } from '../disposable';
import { Connection } from './connection';

export interface RegisterConnectionOptions {
    /**
     * Allow replacing the connection or not if it is already registered.
     *
     * @default true
     */
    allowReplace?: boolean
}

export interface ConnectionRegistry<K, T extends Connection<unknown>> {
    hasConnection(key: K): boolean;
    getConnection(key: K): T | undefined;
    registerConnection<C extends T>(key: K, connection: C, options?: RegisterConnectionOptions): C;
    unregisterConnection(key: K): boolean;
}

export class DefaultConnectionRegistry<K, T extends Connection<unknown>> implements ConnectionRegistry<K, T> {

    protected connections = new Map<K, { connection: T, disposables: DisposableCollection }>();

    hasConnection(key: K): boolean {
        return this.connections.has(key);
    }

    getConnection(key: K): T | undefined {
        return this.connections.get(key)?.connection;
    }

    registerConnection<C extends T>(key: K, connection: C, options?: RegisterConnectionOptions): C {
        const replace = options?.allowReplace ?? true;
        // first dispose of the previous registered connection for this key:
        let handle = this.connections.get(key);
        if (handle) {
            if (replace) {
                throw new Error(`connection already registered for key=${key}`);
            }
            handle.disposables.dispose();
        }
        // register the new connection:
        this.connections.set(key, handle = { connection, disposables: new DisposableCollection() });
        connection.onClose(() => this.unregisterConnection(key), undefined, handle.disposables);
        return connection;
    }

    unregisterConnection(key: K): boolean {
        const handle = this.connections.get(key);
        if (handle) {
            handle.disposables.dispose();
            return true;
        }
        return false;
    }
}
