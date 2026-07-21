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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';

let disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { AttachContainerArgs, ContainerConnectionResult, RunningContainerInfo } from '../electron-common/remote-container-connection-provider';
import { DevContainerStartupContribution } from './dev-container-startup-contribution';
import type { AttachScreenErrorActions } from './dev-container-attach-screen';

disableJSDOM();

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

    collect(contributionArgs: string[][]): Promise<string[]> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this as any).remoteCliArgsContributions = {
            getContributions: () => contributionArgs.map(args => ({ getRemoteCliArgs: () => args }))
        };
        return this.collectRemoteCliArgs();
    }
}

describe('DevContainerStartupContribution#resolveAttachArgs', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

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

    describe('#collectRemoteCliArgs', () => {
        it('flattens the args from every contribution', async () => {
            const args = await contribution.collect([['--session-preference=a=base64:MQ=='], [], ['--x', '--y']]);
            expect(args).to.deep.equal(['--session-preference=a=base64:MQ==', '--x', '--y']);
        });
    });
});

class AttachHarness extends DevContainerStartupContribution {
    stages: string[] = [];
    errors: Array<{ message: string, actions: AttachScreenErrorActions }> = [];
    disposeCount = 0;
    showCount = 0;
    openRemoteCalls: string[] = [];
    protected statusListener: ((message: string) => void) | undefined;

    setup(opts: { containers?: RunningContainerInfo[], attachResult?: ContainerConnectionResult | Error, statusDuringAttach?: string }): void {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        (this as any).logger = { info: () => { }, warn: () => { }, error: () => { } };
        (this as any).attachScreen = {
            showAttaching: () => { this.showCount++; },
            reportStage: (message: string) => this.stages.push(message),
            reportError: (message: string, actions: AttachScreenErrorActions) => this.errors.push({ message, actions }),
            dispose: () => { this.disposeCount++; }
        };
        (this as any).containerOutputProvider = {
            onDidReportStatus: (cb: (message: string) => void) => {
                this.statusListener = cb;
                return { dispose: () => { this.statusListener = undefined; } };
            }
        };
        (this as any).remotePreferences = {};
        (this as any).remoteCliArgsContributions = { getContributions: () => [] };
        (this as any).connectionProvider = {
            listRunningContainers: async () => opts.containers ?? [],
            getWorkspaceCandidates: async () => [],
            scanForDevContainerConfig: async () => undefined,
            attachToContainer: async () => {
                if (opts.statusDuringAttach) {
                    this.statusListener?.(opts.statusDuringAttach);
                }
                if (opts.attachResult instanceof Error) {
                    throw opts.attachResult;
                }
                return opts.attachResult!;
            }
        };
        /* eslint-enable @typescript-eslint/no-explicit-any */
    }

    protected override openRemote(port: string): void {
        this.openRemoteCalls.push(port);
    }

    run(args: AttachContainerArgs): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (this as any).runStartupAttach(args);
    }
}

describe('DevContainerStartupContribution#runStartupAttach', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    const runningB: RunningContainerInfo = { id: 'abc123def456', name: 'B', image: 'img', status: 'running', created: 0 };

    it('reloads into the container on success without showing an error', async () => {
        const harness = new AttachHarness();
        harness.setup({ containers: [runningB], attachResult: { port: '9000', workspacePath: '/w', containerId: 'abc123def456' } });

        await harness.run({ containerId: 'B', scanForDevJson: false });

        expect(harness.openRemoteCalls).to.deep.equal(['9000']);
        expect(harness.errors).to.have.lengthOf(0);
        expect(harness.showCount).to.be.greaterThan(0);
    });

    it('forwards backend status messages to the attach screen', async () => {
        const harness = new AttachHarness();
        harness.setup({
            containers: [runningB],
            attachResult: { port: '9000', workspacePath: '/w', containerId: 'abc123def456' },
            statusDuringAttach: 'Starting application on remote...'
        });

        await harness.run({ containerId: 'B', scanForDevJson: false });

        expect(harness.stages).to.include('Starting application on remote...');
    });

    it('shows an error with retry/close when the container is not found, without reloading', async () => {
        const harness = new AttachHarness();
        harness.setup({ containers: [] });

        await harness.run({ containerId: 'missing', scanForDevJson: false });

        expect(harness.openRemoteCalls).to.have.lengthOf(0);
        expect(harness.errors).to.have.lengthOf(1);
        expect(harness.errors[0].message).to.match(/not found/i);
    });

    it('retry re-runs the attach; close dismisses the screen', async () => {
        const harness = new AttachHarness();
        harness.setup({ containers: [] });

        await harness.run({ containerId: 'missing', scanForDevJson: false });
        expect(harness.errors).to.have.lengthOf(1);

        await harness.errors[0].actions.retry();
        expect(harness.errors).to.have.lengthOf(2);

        harness.errors[1].actions.close();
        expect(harness.disposeCount).to.be.greaterThan(0);
    });
});
