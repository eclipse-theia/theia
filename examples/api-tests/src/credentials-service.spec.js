// *****************************************************************************
// Copyright (C) 2024 TypeFox and others.
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

// @ts-check
describe('CredentialsService', function () {
    this.timeout(5000);
    const { assert } = chai;

    const { CredentialsService } = require('@theia/core/lib/browser/credentials-service');

    /** @type {import('inversify').Container} */
    const container = window['theia'].container;
    /** @type {import('@theia/core/lib/browser/credentials-service').CredentialsService} */
    const credentials = container.get(CredentialsService);

    const serviceName = 'theia-test';
    const accountName = 'test-account';
    const password = 'test-password';

    this.beforeEach(async () => {
        await credentials.deletePassword(serviceName, accountName);
    });

    it('can set and retrieve stored credentials', async function () {
        await credentials.setPassword(serviceName, accountName, password);
        const storedPassword = await credentials.getPassword(serviceName, accountName);
        assert.strictEqual(storedPassword, password);
    });

    it('can retrieve all account keys for a service', async function () {
        // Initially, there should be no keys for the service
        let keys = await credentials.keys(serviceName);
        assert.strictEqual(keys.length, 0);

        // Add a single credential
        await credentials.setPassword(serviceName, accountName, password);
        keys = await credentials.keys(serviceName);
        assert.strictEqual(keys.length, 1);
        assert.include(keys, accountName);

        // Add more credentials with different account names
        const accountName2 = 'test-account-2';
        const accountName3 = 'test-account-3';
        await credentials.setPassword(serviceName, accountName2, 'password2');
        await credentials.setPassword(serviceName, accountName3, 'password3');

        keys = await credentials.keys(serviceName);
        assert.strictEqual(keys.length, 3);
        assert.include(keys, accountName);
        assert.include(keys, accountName2);
        assert.include(keys, accountName3);

        // Clean up all accounts
        await credentials.deletePassword(serviceName, accountName);
        await credentials.deletePassword(serviceName, accountName2);
        await credentials.deletePassword(serviceName, accountName3);

        // Verify keys are removed after deletion
        keys = await credentials.keys(serviceName);
        assert.strictEqual(keys.length, 0);
    });

});
