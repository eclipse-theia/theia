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
import { join } from 'path';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { CopilotSdkLoader } from './copilot-sdk-loader';

/** What the loader checks for before accepting a module as the SDK. */
const usableSdk = {
    CopilotClient: function CopilotClient(): void { },
    RuntimeConnection: { forStdio: () => ({ kind: 'stdio' }) }
};

class TestableCopilotSdkLoader extends CopilotSdkLoader {

    shipped: unknown;
    installed: unknown;
    installedFailure: Error | undefined;
    readonly importedFromCli: string[] = [];

    constructor(protected readonly clis: string[]) {
        super();
        let call = 0;
        Object.assign(this, {
            logger: new MockLogger(),
            cliLocator: { resolve: async () => this.clis[Math.min(call++, this.clis.length - 1)] }
        });
    }

    protected override async importShipped(entry: string): Promise<unknown | undefined> {
        this.importedFromCli.push(entry);
        return this.shipped;
    }

    protected override importInstalled(): unknown {
        if (this.installedFailure) {
            throw this.installedFailure;
        }
        return this.installed;
    }
}

describe('CopilotSdkLoader', () => {

    const cli = join('/opt', 'copilot', 'copilot');

    it('should load the SDK that ships with the CLI', async () => {
        const loader = new TestableCopilotSdkLoader([cli]);
        loader.shipped = usableSdk;
        expect(await loader.load()).to.equal(usableSdk);
        expect(loader.importedFromCli).to.deep.equal([join('/opt', 'copilot', 'copilot-sdk', 'index.js')]);
    });

    it('should fall back to an installed SDK when the CLI does not carry one', async () => {
        const loader = new TestableCopilotSdkLoader([cli]);
        loader.installed = usableSdk;
        expect(await loader.load()).to.equal(usableSdk);
    });

    it('should report the CLI when neither it nor an installation provides the SDK', async () => {
        const loader = new TestableCopilotSdkLoader([cli]);
        loader.installedFailure = new Error("Cannot find module '@github/copilot-sdk'");
        try {
            await loader.load();
            expect.fail('should have rejected');
        } catch (error) {
            // The module resolution failure is of no use to the user, the CLI to update is.
            expect(String(error)).to.contain(cli);
            expect(String(error)).to.not.contain('Cannot find module');
        }
    });

    it('should reject an SDK that does not provide what is used', async () => {
        const loader = new TestableCopilotSdkLoader([cli]);
        loader.shipped = { CopilotClient: function (): void { } };
        try {
            await loader.load();
            expect.fail('should have rejected');
        } catch (error) {
            expect(String(error)).to.contain(cli);
        }
    });

    it('should load once for as long as the CLI stays the same', async () => {
        const loader = new TestableCopilotSdkLoader([cli]);
        loader.shipped = usableSdk;
        await loader.load();
        await loader.load();
        expect(loader.importedFromCli).to.have.lengthOf(1);
    });

    it('should load again when a different CLI serves the requests', async () => {
        const other = join('/usr', 'local', 'copilot');
        const loader = new TestableCopilotSdkLoader([cli, other]);
        loader.shipped = usableSdk;
        await loader.load();
        await loader.load();
        expect(loader.importedFromCli).to.deep.equal([
            join('/opt', 'copilot', 'copilot-sdk', 'index.js'),
            join('/usr', 'local', 'copilot-sdk', 'index.js')
        ]);
    });

    it('should not remember a failed load, since the CLI can be replaced while running', async () => {
        const loader = new TestableCopilotSdkLoader([cli]);
        loader.shipped = {};
        await loader.load().catch(() => { /* expected */ });
        loader.shipped = usableSdk;
        expect(await loader.load()).to.equal(usableSdk);
        expect(loader.importedFromCli).to.have.lengthOf(2);
    });
});
