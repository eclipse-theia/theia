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
import { InMemoryKeyStoreService } from './in-memory-key-store-service.js';

describe('InMemoryKeyStoreService', () => {

    let keyStore: InMemoryKeyStoreService;

    beforeEach(() => {
        keyStore = new InMemoryKeyStoreService();
    });

    it('returns the password that was set', async () => {
        await keyStore.setPassword('service', 'account', 'secret');

        expect(await keyStore.getPassword('service', 'account')).to.equal('secret');
        expect(await keyStore.getPassword('service', 'other')).to.equal(undefined);
        expect(await keyStore.getPassword('other', 'account')).to.equal(undefined);
    });

    it('lists the credentials of a service', async () => {
        await keyStore.setPassword('service', 'a', 'secret-a');
        await keyStore.setPassword('service', 'b', 'secret-b');
        await keyStore.setPassword('other', 'c', 'secret-c');

        expect(await keyStore.keys('service')).to.deep.equal(['a', 'b']);
        expect(await keyStore.findPassword('service')).to.equal('secret-a');
        expect(await keyStore.findCredentials('service')).to.deep.equal([
            { account: 'a', password: 'secret-a' },
            { account: 'b', password: 'secret-b' }
        ]);
    });

    it('deletes a password', async () => {
        await keyStore.setPassword('service', 'account', 'secret');

        expect(await keyStore.deletePassword('service', 'account')).to.equal(true);
        expect(await keyStore.deletePassword('service', 'account')).to.equal(false);
        expect(await keyStore.getPassword('service', 'account')).to.equal(undefined);
        expect(await keyStore.keys('service')).to.deep.equal([]);
        expect(await keyStore.findPassword('service')).to.equal(undefined);
    });

});
