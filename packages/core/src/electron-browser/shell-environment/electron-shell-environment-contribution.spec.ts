// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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
import { Container } from 'inversify';
import { Emitter } from '../../common/event.js';
import { ILogger } from '../../common/logger.js';
import { MessageService } from '../../common/message-service.js';
import { PreferenceService } from '../../common/preferences/preference-service.js';
import { Deferred, wait } from '../../common/promise-util.js';
import { ShellEnvironmentResolutionTimeout, ShellEnvironmentResolution, ShellEnvironmentServer } from '../../common/shell-environment.js';
import { MockLogger } from '../../common/test/mock-logger.js';
import { ElectronShellEnvironmentContribution } from './electron-shell-environment-contribution.js';

describe('ElectronShellEnvironmentContribution', () => {

    let resolution: Deferred<ShellEnvironmentResolution>;
    let warnings: string[];
    let storedTimeouts: (number | undefined)[];
    let configuredTimeout: number | undefined;
    let preferenceChanged: Emitter<{ preferenceName: string }>;

    const setup = (): ElectronShellEnvironmentContribution => {
        resolution = new Deferred();
        warnings = [];
        storedTimeouts = [];
        configuredTimeout = undefined;
        preferenceChanged = new Emitter();
        const container = new Container({ defaultScope: 'Singleton' });
        container.bind(ILogger).to(MockLogger);
        container.bind(MessageService).toConstantValue({
            warn: async (message: string) => { warnings.push(message); return undefined; }
        } as unknown as MessageService);
        container.bind(PreferenceService).toConstantValue({
            ready: Promise.resolve(),
            inspect: () => ({ globalValue: configuredTimeout }),
            onPreferenceChanged: preferenceChanged.event
        } as unknown as PreferenceService);
        container.bind(ShellEnvironmentServer).toConstantValue(<ShellEnvironmentServer>{
            whenResolved: () => resolution.promise,
            setResolutionTimeout: async seconds => { storedTimeouts.push(seconds); }
        });
        container.bind(ElectronShellEnvironmentContribution).toSelf();
        return container.get(ElectronShellEnvironmentContribution);
    };

    const start = async (outcome: ShellEnvironmentResolution): Promise<void> => {
        setup().onStart();
        resolution.resolve(outcome);
        await wait(0);
    };

    it('warns when the login shell did not answer in time', async () => {
        await start({ status: 'timeout' });
        expect(warnings).to.have.lengthOf(1);
        expect(warnings[0]).to.contain('reasonable time');
    });

    it('warns with the reason when the login shell could not be resolved', async () => {
        await start({ status: 'failed', reason: 'The login shell exited with code 3' });
        expect(warnings).to.deep.equal(['Unable to resolve your shell environment: The login shell exited with code 3']);
    });

    it('says nothing when the environment was applied or the resolution skipped', async () => {
        await start({ status: 'applied' });
        await start({ status: 'skipped', reason: 'the application runs on Windows' });
        expect(warnings).to.be.empty;
    });

    it('stores the configured timeout for the next start, and again when it changes', async () => {
        const contribution = setup();
        contribution.onStart();
        await wait(0);
        expect(storedTimeouts).to.deep.equal([undefined]);

        configuredTimeout = 30;
        preferenceChanged.fire({ preferenceName: 'application.confirmExit' });
        expect(storedTimeouts).to.deep.equal([undefined]);
        preferenceChanged.fire({ preferenceName: ShellEnvironmentResolutionTimeout.PREFERENCE });
        expect(storedTimeouts).to.deep.equal([undefined, 30]);
    });
});
