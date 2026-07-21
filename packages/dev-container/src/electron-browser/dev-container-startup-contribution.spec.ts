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
import { AttachContainerArgs } from '../electron-common/remote-container-connection-provider';
import { DevContainerStartupContribution } from './dev-container-startup-contribution';

class TestDevContainerStartupContribution extends DevContainerStartupContribution {

    forwardedArgv: string[] | undefined;
    backendCalls = 0;
    backendArgs: AttachContainerArgs | undefined;

    protected override getForwardedArgv(): string[] | undefined {
        return this.forwardedArgv;
    }

    resolve(): Promise<AttachContainerArgs | undefined> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this as any).connectionProvider = {
            getAttachContainerArgs: async () => {
                this.backendCalls++;
                return this.backendArgs;
            }
        };
        return this.resolveAttachArgs();
    }
}

describe('DevContainerStartupContribution#resolveAttachArgs', () => {

    let contribution: TestDevContainerStartupContribution;

    beforeEach(() => {
        contribution = new TestDevContainerStartupContribution();
    });

    it('reads the container from the backend on a cold-start window (no forwarded argv)', async () => {
        contribution.forwardedArgv = undefined;
        contribution.backendArgs = { containerId: 'A', scanForDevJson: true };

        const result = await contribution.resolve();

        expect(result).to.deep.equal({ containerId: 'A', scanForDevJson: true });
        expect(contribution.backendCalls).to.equal(1);
    });

    it('reads the container from the forwarded argv on a second-instance window', async () => {
        contribution.forwardedArgv = ['--attach-container', 'B'];
        contribution.backendArgs = { containerId: 'A', scanForDevJson: true };

        const result = await contribution.resolve();

        expect(result).to.deep.equal({ containerId: 'B', scanForDevJson: true });
        // The stale backend value (from the first launch) must not be consulted.
        expect(contribution.backendCalls).to.equal(0);
    });

    it('honors --no-dev-json in the forwarded argv', async () => {
        contribution.forwardedArgv = ['--attach-container', 'B', '--no-dev-json'];

        const result = await contribution.resolve();

        expect(result).to.deep.equal({ containerId: 'B', scanForDevJson: false });
    });

    it('does not attach for a second-instance window without --attach-container', async () => {
        contribution.forwardedArgv = ['--session-preference', 'foo=1'];
        contribution.backendArgs = { containerId: 'A', scanForDevJson: true };

        const result = await contribution.resolve();

        expect(result).to.be.undefined;
        expect(contribution.backendCalls).to.equal(0);
    });
});
