// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { CopilotCredentialStore } from './copilot-credential-store';

/** A keystore that records what was asked of it, keyed the way the real one is. */
class FakeKeyStore {

    readonly entries = new Map<string, string>();
    failing = false;

    async getPassword(service: string, account: string): Promise<string | undefined> {
        this.check();
        return this.entries.get(`${service}/${account}`);
    }

    async setPassword(service: string, account: string, password: string): Promise<void> {
        this.check();
        this.entries.set(`${service}/${account}`, password);
    }

    async deletePassword(service: string, account: string): Promise<boolean> {
        this.check();
        return this.entries.delete(`${service}/${account}`);
    }

    protected check(): void {
        if (this.failing) {
            throw new Error('keychain unavailable');
        }
    }
}

function store(keyStore: FakeKeyStore): CopilotCredentialStore {
    const credentialStore = new CopilotCredentialStore();
    Object.assign(credentialStore, { keyStoreService: keyStore, logger: new MockLogger() });
    return credentialStore;
}

describe('CopilotCredentialStore', () => {

    const ours = `${CopilotCredentialStore.SERVICE}/${CopilotCredentialStore.ACCOUNT}`;
    const legacy = `${CopilotCredentialStore.LEGACY_SERVICE}/${CopilotCredentialStore.ACCOUNT}`;

    it('should keep the token together with the account it belongs to', async () => {
        const keyStore = new FakeKeyStore();
        await store(keyStore).set({ token: 'gho_token', accountLabel: 'octocat', enterpriseUrl: 'company.ghe.com' });
        expect(await store(keyStore).get()).to.deep.equal({ token: 'gho_token', accountLabel: 'octocat', enterpriseUrl: 'company.ghe.com' });
    });

    it('should report nothing when the application never signed in', async () => {
        expect(await store(new FakeKeyStore()).get()).to.be.undefined;
    });

    it('should report nothing for an entry without a token', async () => {
        const keyStore = new FakeKeyStore();
        keyStore.entries.set(ours, JSON.stringify({ accountLabel: 'octocat' }));
        expect(await store(keyStore).get()).to.be.undefined;
    });

    it('should report nothing for an entry that is not readable', async () => {
        const keyStore = new FakeKeyStore();
        keyStore.entries.set(ours, 'not json');
        expect(await store(keyStore).get()).to.be.undefined;
    });

    it('should report nothing rather than fail when the keychain is unavailable', async () => {
        const keyStore = new FakeKeyStore();
        keyStore.failing = true;
        expect(await store(keyStore).get()).to.be.undefined;
    });

    it('should remove only the entry of this application when signing out', async () => {
        const keyStore = new FakeKeyStore();
        keyStore.entries.set(ours, JSON.stringify({ token: 'gho_token' }));
        keyStore.entries.set('some-other-tool/github', 'not ours');
        await store(keyStore).delete();
        expect([...keyStore.entries.keys()]).to.deep.equal(['some-other-tool/github']);
    });

    it('should discard the sign-in of the previous integration and report that it did', async () => {
        const keyStore = new FakeKeyStore();
        keyStore.entries.set(legacy, JSON.stringify({ accessToken: 'gho_legacy' }));
        expect(await store(keyStore).deleteLegacy()).to.be.true;
        expect(keyStore.entries.has(legacy)).to.be.false;
    });

    it('should report that there was no previous sign-in to discard', async () => {
        expect(await store(new FakeKeyStore()).deleteLegacy()).to.be.false;
    });
});
