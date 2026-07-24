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
import { PreferenceFrontendContribution } from './preference-frontend-contribution';

class TestPreferenceFrontendContribution extends PreferenceFrontendContribution {

    forwardedArgv: string[] | undefined;
    sessionBackendCalls = 0;
    persistentBackendCalls = 0;

    protected override getForwardedArgv(): string[] | undefined {
        return this.forwardedArgv;
    }

    resolve(): Promise<{ session: [string, unknown][], persistent: [string, unknown][] }> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this as any).CliPreferences = {
            getSessionPreferences: async () => {
                this.sessionBackendCalls++;
                return [['backend.session', 1]] as [string, unknown][];
            },
            getPreferences: async () => {
                this.persistentBackendCalls++;
                return [['backend.persistent', 2]] as [string, unknown][];
            }
        };
        return this.resolveCliPreferences();
    }
}

describe('PreferenceFrontendContribution#resolveCliPreferences', () => {

    let contribution: TestPreferenceFrontendContribution;

    beforeEach(() => {
        contribution = new TestPreferenceFrontendContribution();
    });

    it('reads preferences from the backend on a cold-start window (no forwarded argv)', async () => {
        contribution.forwardedArgv = undefined;

        const result = await contribution.resolve();

        expect(result.session).to.deep.equal([['backend.session', 1]]);
        expect(result.persistent).to.deep.equal([['backend.persistent', 2]]);
        expect(contribution.sessionBackendCalls).to.equal(1);
    });

    it('reads --session-preference from the forwarded argv on a second-instance window', async () => {
        contribution.forwardedArgv = ['--session-preference', 'editor.fontSize=20', '--attach-container', 'B'];

        const result = await contribution.resolve();

        expect(result.session).to.deep.equal([['editor.fontSize', 20]]);
        // The stale backend values (from the first launch) must not be consulted.
        expect(contribution.sessionBackendCalls).to.equal(0);
        expect(contribution.persistentBackendCalls).to.equal(0);
    });

    it('reads --set-preference from the forwarded argv on a second-instance window', async () => {
        contribution.forwardedArgv = ['--set-preference', 'editor.tabSize=2'];

        const result = await contribution.resolve();

        expect(result.persistent).to.deep.equal([['editor.tabSize', 2]]);
        expect(result.session).to.deep.equal([]);
    });
});
