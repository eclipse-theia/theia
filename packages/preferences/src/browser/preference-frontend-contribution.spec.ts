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
import { CliPreference } from '../common/cli-preferences';
import { PreferenceFrontendContribution } from './preference-frontend-contribution';

const launchArgs = (values: Record<string, string[]>): LaunchArguments => ({ values, negated: [] });

class TestPreferenceFrontendContribution extends PreferenceFrontendContribution {

    forwardedArgs: LaunchArguments | undefined;
    sessionBackendCalls = 0;
    persistentBackendCalls = 0;

    resolve(): Promise<{ session: CliPreference[], persistent: CliPreference[] }> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this as any).launchArgs = { getLaunchArgs: () => this.forwardedArgs };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this as any).CliPreferences = {
            getSessionPreferences: async () => {
                this.sessionBackendCalls++;
                return [{ preferenceName: 'backend.session', value: 1 }] as CliPreference[];
            },
            getPreferences: async () => {
                this.persistentBackendCalls++;
                return [{ preferenceName: 'backend.persistent', value: 2 }] as CliPreference[];
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

        expect(result.session).to.deep.equal([{ preferenceName: 'backend.session', value: 1 }]);
        expect(result.persistent).to.deep.equal([{ preferenceName: 'backend.persistent', value: 2 }]);
        expect(contribution.sessionBackendCalls).to.equal(1);
    });

    it('layers --session-preference from the forwarded options on top of the backend values', async () => {
        contribution.forwardedArgs = launchArgs({ 'session-preference': ['editor.fontSize=20'], 'attach-container': ['B'] });

        const result = await contribution.resolve();

        // Process-wide backend values are kept (base) and the forwarded value is added on top.
        expect(result.session).to.deep.equal([
            { preferenceName: 'backend.session', value: 1 },
            { preferenceName: 'editor.fontSize', value: 20 }
        ]);
        expect(result.persistent).to.deep.equal([{ preferenceName: 'backend.persistent', value: 2 }]);
        expect(contribution.sessionBackendCalls).to.equal(1);
    });

    it('layers --set-preference from the forwarded options on top of the backend values', async () => {
        contribution.forwardedArgs = launchArgs({ 'set-preference': ['editor.tabSize=2'] });

        const result = await contribution.resolve();

        expect(result.persistent).to.deep.equal([
            { preferenceName: 'backend.persistent', value: 2 },
            { preferenceName: 'editor.tabSize', value: 2 }
        ]);
        expect(result.session).to.deep.equal([{ preferenceName: 'backend.session', value: 1 }]);
    });

    it('lets a forwarded value override a same-key backend value', async () => {
        contribution.forwardedArgs = launchArgs({ 'session-preference': ['backend.session=99'] });

        const result = await contribution.resolve();

        expect(result.session).to.deep.equal([{ preferenceName: 'backend.session', value: 99 }]);
    });

    it('merges language overrides without colliding with the base preference name', async () => {
        contribution.forwardedArgs = launchArgs({
            'session-preference': ['[typescript].backend.session=4']
        });

        const result = await contribution.resolve();

        expect(result.session).to.deep.equal([
            { preferenceName: 'backend.session', value: 1 },
            { preferenceName: 'backend.session', value: 4, overrideIdentifier: 'typescript' }
        ]);
    });
});
