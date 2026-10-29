// *****************************************************************************
// Copyright (C) 2026 CodeSignal and others.
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

const disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
try {
    FrontendApplicationConfigProvider.set({});
} catch {
    // Another spec in this process has already set it.
}

import 'reflect-metadata';

import { expect } from 'chai';
import { ProgressService } from '@theia/core';
import { TaskIdentifier } from '@theia/task/lib/common';
import { WorkspaceTrustService } from '@theia/workspace/lib/browser';
import { DebugConfiguration } from '../common/debug-common';
import { DebugService } from '../common/debug-service';
import { VariableResolverService } from '@theia/variable-resolver/lib/browser';
import { DebugConfigurationManager } from './debug-configuration-manager';
import { DebugSession } from './debug-session';
import { DebugSessionConfigurationLabelProvider } from './debug-session-configuration-label-provider';
import { DebugSessionManager } from './debug-session-manager';
import { DebugConfigurationSessionOptions, InternalDebugSessionOptions } from './debug-session-options';

disableJSDOM();

const LAUNCH: DebugConfiguration = { name: 'Debug', type: 'node', request: 'launch', program: '${file}', preLaunchTask: 'build' };

class TestDebugSessionManager extends DebugSessionManager {
    readonly tasks: string[] = [];
    readonly steps: string[] = [];
    readonly started: DebugConfigurationSessionOptions[] = [];
    taskSucceeds = true;
    resolvedName: string | undefined;
    launchConfiguration: DebugConfiguration = LAUNCH;

    protected override readonly debugConfigurationManager = {
        findConfiguration: (name: string) => name === this.launchConfiguration.name ? this.launchConfiguration : undefined
    } as unknown as DebugConfigurationManager;

    protected override async runTask(_workspaceFolderUri: string | undefined, taskName: string | TaskIdentifier | undefined): Promise<boolean> {
        if (taskName) {
            this.tasks.push(String(taskName));
            this.steps.push('task');
        }
        return this.taskSucceeds;
    }

    protected override readonly workspaceTrustService = { requestWorkspaceTrust: async () => true } as unknown as WorkspaceTrustService;
    protected override readonly progressService = { withProgress: (_: string, __: string, run: () => Promise<unknown>) => run() } as unknown as ProgressService;
    protected override readonly sessionConfigurationLabelProvider = {
        getLabel: () => LAUNCH.name
    } as unknown as DebugSessionConfigurationLabelProvider;
    protected override readonly debug = {
        createDebugSession: async () => 'new-session',
        terminateDebugSession: async () => { },
        provideDebuggerVariables: async () => ({})
    } as unknown as DebugService;
    protected override readonly variableResolver = {
        resolve: async (configuration: DebugConfiguration) => configuration
    } as unknown as VariableResolverService;

    protected override async resolveDebugConfiguration(configuration: DebugConfiguration): Promise<DebugConfiguration> {
        return { ...configuration, name: this.resolvedName ?? configuration.name, program: '/resolved/' + configuration.program };
    }

    protected override async resolveDebugConfigurationWithSubstitutedVariables(configuration: DebugConfiguration): Promise<DebugConfiguration> {
        return configuration;
    }

    protected override async saveAll(): Promise<boolean> {
        this.steps.push('save');
        return true;
    }

    protected override async fireWillStartDebugSession(): Promise<void> { }

    protected override async doStart(_sessionId: string, options: DebugConfigurationSessionOptions): Promise<DebugSession> {
        this.started.push(options);
        return {} as DebugSession;
    }

    async createSession(configuration: DebugConfiguration, supportsRestart = true): Promise<FakeSession> {
        const options = await this.resolveConfiguration({ name: configuration.name, configuration });
        return new FakeSession(options as InternalDebugSessionOptions & DebugConfigurationSessionOptions, supportsRestart);
    }

    restartRequestedByAdapter(session: DebugSession): Promise<DebugSession | undefined> {
        return this.doRestart(session, true, false);
    }
}

class FakeSession {
    readonly restarts: (DebugConfigurationSessionOptions | undefined)[] = [];
    stopped = false;

    constructor(public options: InternalDebugSessionOptions & DebugConfigurationSessionOptions, readonly supportsRestart: boolean) { }

    get configuration(): DebugConfiguration {
        return this.options.configuration;
    }

    canRestart(): boolean {
        return this.supportsRestart;
    }

    async restart(options?: DebugConfigurationSessionOptions): Promise<void> {
        this.restarts.push(options);
    }

    async stop(): Promise<void> {
        this.stopped = true;
    }
}

describe('DebugSessionManager restart', () => {
    let manager: TestDebugSessionManager;

    beforeEach(() => {
        manager = new TestDebugSessionManager();
    });

    it('runs the preLaunchTask and restarts with the session configuration when the user restarts', async () => {
        const fake = await manager.createSession({ ...LAUNCH, noDebug: false });

        await manager.restartSession(fake as unknown as DebugSession);

        expect(manager.tasks).to.deep.equal(['build']);
        expect(fake.restarts).to.deep.equal([fake.options]);
    });

    it('saves before it runs the preLaunchTask', async () => {
        const fake = await manager.createSession({ ...LAUNCH, noDebug: false });
        manager.steps.length = 0;

        await manager.restartSession(fake as unknown as DebugSession);

        expect(manager.steps).to.deep.equal(['save', 'task']);
    });

    it('does not restart when the preLaunchTask fails', async () => {
        const fake = await manager.createSession({ ...LAUNCH, noDebug: false });
        manager.taskSucceeds = false;

        await manager.restartSession(fake as unknown as DebugSession);

        expect(fake.restarts).to.deep.equal([]);
    });

    it('restarts without running tasks when the adapter asks for it', async () => {
        const fake = await manager.createSession({ ...LAUNCH, noDebug: false });

        await manager.restartRequestedByAdapter(fake as unknown as DebugSession);

        expect(manager.tasks).to.deep.equal([]);
        expect(fake.restarts).to.deep.equal([fake.options]);
    });

    it('starts again as a new launch, so the preLaunchTask runs, when the adapter cannot restart', async () => {
        const fake = await manager.createSession({ ...LAUNCH, noDebug: false }, false);
        fake.options.configuration.__restart = true;

        await manager.restartSession(fake as unknown as DebugSession);

        expect(fake.stopped).to.equal(true);
        expect(manager.tasks).to.deep.equal(['build']);
        expect(manager.started).to.have.length(1);
        expect(manager.started[0].configuration).to.not.have.property('__restart');
    });

    it('marks an adapter-requested restart, so the preLaunchTask does not run, when the adapter cannot restart', async () => {
        const fake = await manager.createSession({ ...LAUNCH, noDebug: false }, false);

        await manager.restartRequestedByAdapter(fake as unknown as DebugSession);

        expect(manager.tasks).to.deep.equal([]);
        expect(manager.started[0].configuration.__restart).to.equal(true);
        expect(fake.options.configuration).to.not.have.property('__restart');
    });

    it('resolves the launch configuration again when it changed since the session started', async () => {
        await manager.createSession(LAUNCH);
        const fake = await manager.createSession({ ...LAUNCH, noDebug: false });
        manager.launchConfiguration = { ...LAUNCH, program: 'other.js' };

        await manager.restartSession(fake as unknown as DebugSession);

        expect(fake.restarts).to.have.length(1);
        expect(fake.restarts[0]!.configuration.program).to.equal('/resolved/other.js');
        expect((fake.restarts[0] as InternalDebugSessionOptions).id).to.equal(1);
    });

    it('keeps the resolved configuration when the launch configuration did not change', async () => {
        const fake = await manager.createSession({ ...LAUNCH, noDebug: false });

        await manager.restartSession(fake as unknown as DebugSession);

        expect(fake.restarts[0]).to.equal(fake.options);
    });

    it('uses the changed preLaunchTask and drops keys removed from the launch configuration', async () => {
        manager.launchConfiguration = { ...LAUNCH, stopOnEntry: true };
        const fake = await manager.createSession({ ...manager.launchConfiguration, noDebug: false });
        manager.launchConfiguration = { ...LAUNCH, preLaunchTask: 'rebuild' };

        await manager.restartSession(fake as unknown as DebugSession);

        expect(manager.tasks).to.deep.equal(['rebuild']);
        expect(fake.restarts[0]!.configuration).to.not.have.property('stopOnEntry');
    });

    it('resolves the launch configuration again when the adapter cannot restart', async () => {
        const fake = await manager.createSession({ ...LAUNCH, noDebug: false }, false);
        manager.launchConfiguration = { ...LAUNCH, program: 'other.js' };

        await manager.restartSession(fake as unknown as DebugSession);

        expect(manager.started[0].configuration.program).to.equal('/resolved/other.js');
    });

    it('compares a later restart with the launch configuration it restarted with', async () => {
        const fake = await manager.createSession({ ...LAUNCH, noDebug: false });
        manager.launchConfiguration = { ...LAUNCH, program: 'other.js' };
        await manager.restartSession(fake as unknown as DebugSession);
        fake.options = fake.restarts[0] as FakeSession['options'];

        await manager.restartSession(fake as unknown as DebugSession);

        expect(fake.restarts[1]).to.equal(fake.options);
    });

    it('keeps what the session added to the launch configuration when it resolves it again', async () => {
        const fake = await manager.createSession({ ...LAUNCH, noDebug: true, parentSessionId: 'parent' });
        manager.launchConfiguration = { ...LAUNCH, program: 'other.js' };

        await manager.restartSession(fake as unknown as DebugSession);

        expect(fake.restarts[0]!.configuration).to.include({ program: '/resolved/other.js', noDebug: true, parentSessionId: 'parent' });
    });

    it('finds the launch configuration by its own name when a resolver renamed the session', async () => {
        manager.resolvedName = 'Debug (renamed)';
        const fake = await manager.createSession({ ...LAUNCH, noDebug: false });
        manager.launchConfiguration = { ...LAUNCH, program: 'other.js' };

        await manager.restartSession(fake as unknown as DebugSession);

        expect(fake.restarts[0]!.configuration.program).to.equal('/resolved/other.js');
    });

    it('does not replace a configuration that only shares its name with the launch configuration', async () => {
        const fake = await manager.createSession({ ...LAUNCH, program: 'inline.js' });
        manager.launchConfiguration = { ...LAUNCH, program: 'other.js' };

        await manager.restartSession(fake as unknown as DebugSession);

        expect(fake.restarts[0]).to.equal(fake.options);
    });

    it('does not use up a session number when it resolves the configuration again', async () => {
        const fake = await manager.createSession(LAUNCH);
        manager.launchConfiguration = { ...LAUNCH, program: 'other.js' };
        await manager.restartSession(fake as unknown as DebugSession);

        const next = await manager.createSession(manager.launchConfiguration);

        expect((next.options as InternalDebugSessionOptions).id).to.equal(1);
    });
});

describe('DebugSession restart', () => {
    it('sends the configuration as the restart arguments', async () => {
        const requests: [string, unknown][] = [];
        const options: DebugConfigurationSessionOptions = { name: LAUNCH.name, configuration: { ...LAUNCH, program: '/new' } };
        const debugSession = Object.assign(Object.create(DebugSession.prototype), {
            data: { options: { name: LAUNCH.name, configuration: LAUNCH } },
            canRestart: () => true,
            sendRequest: async (command: string, args: unknown) => { requests.push([command, args]); }
        }) as DebugSession;

        await debugSession.restart(options);

        expect(requests).to.deep.equal([['restart', { arguments: options.configuration }]]);
        expect(debugSession.options).to.equal(options);
    });
});
