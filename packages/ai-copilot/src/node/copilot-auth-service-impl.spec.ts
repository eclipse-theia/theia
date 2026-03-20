// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
import * as sinon from 'sinon';
import { Container } from '@theia/core/shared/inversify';
import { KeyStoreService } from '@theia/core/lib/common/key-store';
import { CopilotAuthServiceImpl } from './copilot-auth-service-impl';

describe('CopilotAuthServiceImpl', () => {

    let authService: CopilotAuthServiceImpl;
    let keyStoreService: KeyStoreService;
    let getPasswordStub: sinon.SinonStub;

    beforeEach(() => {
        const container = new Container();

        getPasswordStub = sinon.stub();
        keyStoreService = {
            setPassword: sinon.stub().resolves() as KeyStoreService['setPassword'],
            getPassword: getPasswordStub.resolves(undefined) as KeyStoreService['getPassword'],
            deletePassword: sinon.stub().resolves(true) as KeyStoreService['deletePassword'],
            findPassword: sinon.stub().resolves(undefined) as KeyStoreService['findPassword'],
            findCredentials: sinon.stub().resolves([]) as KeyStoreService['findCredentials'],
            keys: sinon.stub().resolves([]) as KeyStoreService['keys']
        };

        container.bind(KeyStoreService).toConstantValue(keyStoreService);
        container.bind(CopilotAuthServiceImpl).toSelf().inSingletonScope();

        authService = container.get(CopilotAuthServiceImpl);
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('getAccessToken', () => {

        it('should return undefined when no credentials are stored', async () => {
            getPasswordStub.resolves(undefined);

            const token = await authService.getAccessToken();
            expect(token).to.be.undefined;
        });

        it('should return the stored access token directly', async () => {
            const oauthToken = 'ghu_test_token';

            getPasswordStub.resolves(JSON.stringify({
                accessToken: oauthToken,
                accountLabel: 'testuser'
            }));

            const token = await authService.getAccessToken();
            expect(token).to.equal(oauthToken);
        });

        it('should return undefined when stored data is malformed', async () => {
            getPasswordStub.resolves('not-valid-json');

            const token = await authService.getAccessToken();
            expect(token).to.be.undefined;
        });
    });

    describe('getAuthState', () => {

        it('should return not authenticated when no credentials are stored', async () => {
            getPasswordStub.resolves(undefined);

            const state = await authService.getAuthState();
            expect(state.isAuthenticated).to.be.false;
            expect(state.accountLabel).to.be.undefined;
        });

        it('should return authenticated with account label when credentials exist', async () => {
            getPasswordStub.resolves(JSON.stringify({
                accessToken: 'gho_test',
                accountLabel: 'testuser',
                enterpriseUrl: undefined
            }));

            const state = await authService.getAuthState();
            expect(state.isAuthenticated).to.be.true;
            expect(state.accountLabel).to.equal('testuser');
        });

        it('should return enterprise URL when stored', async () => {
            getPasswordStub.resolves(JSON.stringify({
                accessToken: 'gho_test',
                accountLabel: 'testuser',
                enterpriseUrl: 'github.mycompany.com'
            }));

            const state = await authService.getAuthState();
            expect(state.isAuthenticated).to.be.true;
            expect(state.enterpriseUrl).to.equal('github.mycompany.com');
        });

        it('should clear outdated non-gho_ token and flag migration', async () => {
            getPasswordStub.resolves(JSON.stringify({
                accessToken: 'ghu_old_token',
                accountLabel: 'testuser'
            }));

            const state = await authService.getAuthState();
            expect(state.isAuthenticated).to.be.false;
            expect(state.migrationRequired).to.be.true;
            expect((keyStoreService.deletePassword as sinon.SinonStub).calledOnce).to.be.true;
        });

        it('should cache the auth state after first retrieval', async () => {
            getPasswordStub.resolves(JSON.stringify({
                accessToken: 'gho_test',
                accountLabel: 'testuser'
            }));

            const state1 = await authService.getAuthState();
            const state2 = await authService.getAuthState();

            expect(state1).to.equal(state2);
            expect(getPasswordStub.calledOnce).to.be.true;
        });
    });

    describe('signOut', () => {

        it('should clear cached auth state on sign out', async () => {
            getPasswordStub.resolves(JSON.stringify({
                accessToken: 'gho_test',
                accountLabel: 'testuser'
            }));

            const stateBefore = await authService.getAuthState();
            expect(stateBefore.isAuthenticated).to.be.true;

            await authService.signOut();

            // After sign out, cached state should be cleared
            // getAuthState should now return the new state without hitting keystore cache
            const stateAfter = await authService.getAuthState();
            expect(stateAfter.isAuthenticated).to.be.false;
        });

        it('should fire auth state changed event on sign out', async () => {
            const stateChanges: { isAuthenticated: boolean }[] = [];
            authService.onAuthStateChanged(state => stateChanges.push(state));

            await authService.signOut();

            expect(stateChanges).to.have.lengthOf(1);
            expect(stateChanges[0].isAuthenticated).to.be.false;
        });

        it('should delete credentials from keystore on sign out', async () => {
            await authService.signOut();
            expect((keyStoreService.deletePassword as sinon.SinonStub).calledOnce).to.be.true;
        });

        it('should notify client on sign out', async () => {
            const client = { onAuthStateChanged: sinon.stub() };
            authService.setClient(client);

            await authService.signOut();

            expect(client.onAuthStateChanged.calledOnce).to.be.true;
            expect(client.onAuthStateChanged.firstCall.args[0].isAuthenticated).to.be.false;
        });
    });
});
