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
import { LaunchArguments } from '@theia/core/lib/common/launch-arguments';

const launchArgs = (values: Record<string, string[]>): LaunchArguments => ({ values, negated: [] });
import { PreferenceFrontendContribution } from './preference-frontend-contribution';

class TestPreferenceFrontendContribution extends PreferenceFrontendContribution {

    forwardedArgs: LaunchArguments | undefined;
    sessionBackendCalls = 0;
    persistentBackendCalls = 0;

    resolve(): Promise<{ session: [string, unknown][], persistent: [string, unknown][] }> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this as any).launchArgs = { getLaunchArgs: () => this.forwardedArgs };
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

    it('reads preferences from the backend on a cold-start window (no forwarded options)', async () => {
        contribution.forwardedArgs = undefined;

        const result = await contribution.resolve();

        expect(result.session).to.deep.equal([['backend.session', 1]]);
        expect(result.persistent).to.deep.equal([['backend.persistent', 2]]);
        expect(contribution.sessionBackendCalls).to.equal(1);
    });

    it('layers --session-preference from the forwarded options on top of the backend values', async () => {
        contribution.forwardedArgs = launchArgs({ 'session-preference': ['editor.fontSize=20'], 'attach-container': ['B'] });

        const result = await contribution.resolve();

        // Process-wide backend values are kept (base) and the forwarded value is added on top.
        expect(result.session).to.deep.equal([['backend.session', 1], ['editor.fontSize', 20]]);
        expect(result.persistent).to.deep.equal([['backend.persistent', 2]]);
        expect(contribution.sessionBackendCalls).to.equal(1);
    });

    it('layers --set-preference from the forwarded options on top of the backend values', async () => {
        contribution.forwardedArgs = launchArgs({ 'set-preference': ['editor.tabSize=2'] });

        const result = await contribution.resolve();

        expect(result.persistent).to.deep.equal([['backend.persistent', 2], ['editor.tabSize', 2]]);
        expect(result.session).to.deep.equal([['backend.session', 1]]);
    });

    it('lets a forwarded value override a same-key backend value', async () => {
        contribution.forwardedArgs = launchArgs({ 'session-preference': ['backend.session=99'] });

        const result = await contribution.resolve();

        expect(result.session).to.deep.equal([['backend.session', 99]]);
    });
});
