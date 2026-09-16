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
import { CopilotAuthState } from '../common/copilot-auth-service';
import { CopilotAuthServiceImpl } from './copilot-auth-service-impl';

interface Stubs {
    /** Whether the sign-in of the previous integration had to be discarded. */
    legacyRemoved: boolean;
    /** How long that cleanup takes, to model a slow keychain. */
    legacyDelay: number;
    authState: CopilotAuthState;
    authStateCalls: number;
    configuredPath: string | undefined;
    deleted: number;
}

class TestableCopilotAuthServiceImpl extends CopilotAuthServiceImpl {

    readonly stubs: Stubs = {
        legacyRemoved: false,
        legacyDelay: 0,
        authState: { isAuthenticated: false },
        authStateCalls: 0,
        configuredPath: undefined,
        deleted: 0
    };

    constructor() {
        super();
        const stubs = this.stubs;
        Object.assign(this, {
            logger: new MockLogger(),
            credentialStore: {
                deleteLegacy: async () => {
                    await new Promise(resolve => setTimeout(resolve, stubs.legacyDelay));
                    return stubs.legacyRemoved;
                }
            },
            cliLocator: { setConfiguredPath: (path: string | undefined) => { stubs.configuredPath = path; } },
            cliAuthProvider: {
                getAuthState: async () => {
                    stubs.authStateCalls++;
                    return stubs.authState;
                },
                signOut: async () => {
                    stubs.deleted++;
                    stubs.authState = { isAuthenticated: false };
                },
                waitForLogin: async () => true
            }
        });
    }

    /** Runs what `@postConstruct` runs in production. */
    start(): void {
        this.init();
    }
}

describe('CopilotAuthServiceImpl - migration of the previous sign-in', () => {

    it('should report that a new sign-in is required, even when asked before the cleanup finished', async () => {
        const service = new TestableCopilotAuthServiceImpl();
        service.stubs.legacyRemoved = true;
        // The frontend evaluates the flag once at startup, so a state cached without it loses it.
        service.stubs.legacyDelay = 20;
        service.start();
        expect(await service.getAuthState()).to.deep.include({ isAuthenticated: false, migrationRequired: true });
    });

    it('should not claim a migration when there was nothing to discard', async () => {
        const service = new TestableCopilotAuthServiceImpl();
        service.start();
        expect(await service.getAuthState()).to.not.have.property('migrationRequired');
    });

    it('should not claim a migration for a user who is signed in', async () => {
        const service = new TestableCopilotAuthServiceImpl();
        service.stubs.legacyRemoved = true;
        service.stubs.authState = { isAuthenticated: true, accountLabel: 'octocat' };
        service.start();
        expect(await service.getAuthState()).to.not.have.property('migrationRequired');
    });

    it('should survive a keychain that cannot be read', async () => {
        const service = new TestableCopilotAuthServiceImpl();
        Object.assign(service, { credentialStore: { deleteLegacy: async () => { throw new Error('keychain unavailable'); } } });
        service.start();
        expect(await service.getAuthState()).to.deep.equal({ isAuthenticated: false });
    });
});

describe('CopilotAuthServiceImpl - state', () => {

    it('should ask the provider once and serve the cached state afterwards', async () => {
        const service = new TestableCopilotAuthServiceImpl();
        service.start();
        await service.getAuthState();
        await service.getAuthState();
        expect(service.stubs.authStateCalls).to.equal(1);
    });

    it('should report the new state after a sign-in', async () => {
        const service = new TestableCopilotAuthServiceImpl();
        service.start();
        await service.getAuthState();
        service.stubs.authState = { isAuthenticated: true, accountLabel: 'octocat' };

        const reported: CopilotAuthState[] = [];
        service.onAuthStateChanged(state => reported.push(state));
        expect(await service.waitForSignIn()).to.be.true;

        expect(reported).to.deep.equal([{ isAuthenticated: true, accountLabel: 'octocat' }]);
        expect(await service.getAuthState()).to.deep.equal({ isAuthenticated: true, accountLabel: 'octocat' });
    });

    it('should report the new state after signing out', async () => {
        const service = new TestableCopilotAuthServiceImpl();
        service.stubs.authState = { isAuthenticated: true, accountLabel: 'octocat' };
        service.start();
        await service.getAuthState();

        const reported: CopilotAuthState[] = [];
        service.onAuthStateChanged(state => reported.push(state));
        await service.signOut();

        expect(service.stubs.deleted).to.equal(1);
        expect(reported).to.deep.equal([{ isAuthenticated: false }]);
    });
});

describe('CopilotAuthServiceImpl - executable path', () => {

    it('should hand the configured location to the lookup, which cannot read preferences itself', async () => {
        const service = new TestableCopilotAuthServiceImpl();
        service.start();
        await service.setExecutablePath('/opt/copilot/copilot');
        expect(service.stubs.configuredPath).to.equal('/opt/copilot/copilot');
    });

    it('should hand on that nothing is configured, so that the CLI is searched for', async () => {
        const service = new TestableCopilotAuthServiceImpl();
        service.start();
        await service.setExecutablePath('/opt/copilot/copilot');
        await service.setExecutablePath(undefined);
        expect(service.stubs.configuredPath).to.be.undefined;
    });
});
