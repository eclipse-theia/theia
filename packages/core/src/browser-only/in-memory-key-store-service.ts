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

import { injectable } from 'inversify';
import { KeyStoreService } from '../common/key-store.js';

/**
 * Keeps secrets in memory for the lifetime of the page. Browser-only applications have no OS keychain,
 * so like VS Code for the web without a secret storage provider, secrets do not survive a reload.
 */
@injectable()
export class InMemoryKeyStoreService implements KeyStoreService {

    /** Passwords by account, by service. */
    protected readonly services = new Map<string, Map<string, string>>();

    async setPassword(service: string, account: string, password: string): Promise<void> {
        let accounts = this.services.get(service);
        if (!accounts) {
            accounts = new Map();
            this.services.set(service, accounts);
        }
        accounts.set(account, password);
    }

    async getPassword(service: string, account: string): Promise<string | undefined> {
        return this.services.get(service)?.get(account);
    }

    async deletePassword(service: string, account: string): Promise<boolean> {
        const accounts = this.services.get(service);
        const deleted = !!accounts?.delete(account);
        if (accounts?.size === 0) {
            this.services.delete(service);
        }
        return deleted;
    }

    async findPassword(service: string): Promise<string | undefined> {
        const accounts = this.services.get(service);
        return accounts ? accounts.values().next().value : undefined;
    }

    async findCredentials(service: string): Promise<Array<{ account: string, password: string }>> {
        return Array.from(this.services.get(service) ?? [], ([account, password]) => ({ account, password }));
    }

    async keys(service: string): Promise<string[]> {
        return Array.from(this.services.get(service)?.keys() ?? []);
    }

}
