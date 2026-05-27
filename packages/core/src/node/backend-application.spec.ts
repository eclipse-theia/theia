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
import { Container, ContainerModule, injectable, preDestroy } from 'inversify';
import { bindContributionProvider, ILogger, Stopwatch } from '../common';
import { Deferred } from '../common/promise-util';
import { MockLogger } from '../common/test/mock-logger';
import { NodeStopwatch } from './performance/node-stopwatch';
import { ProcessUtils } from './process-utils';
import {
    BackendApplication,
    BackendApplicationCliContribution,
    BackendApplicationContribution,
    RootContainer
} from './backend-application';
import { CliContribution } from './cli';

/**
 * Test subclass that exposes the protected `gracefulShutdown` for direct testing.
 */
@injectable()
class TestBackendApplication extends BackendApplication {
    public invokeGracefulShutdown(): Promise<void> {
        return this.gracefulShutdown();
    }
}

// All process events on which `BackendApplication` installs listeners in its
// constructor. We snapshot and restore them around each test to avoid leaking
// listeners across tests (and triggering `MaxListenersExceededWarning`).
const PROCESS_EVENTS = ['SIGINT', 'SIGTERM', 'SIGPIPE', 'exit', 'uncaughtException'] as const;
type ProcessEventName = typeof PROCESS_EVENTS[number];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyListener = (...args: any[]) => void;

describe('BackendApplication', () => {
    let sandbox: sinon.SinonSandbox;
    let exitStub: sinon.SinonStub;
    let savedListeners: Partial<Record<ProcessEventName, AnyListener[]>>;

    beforeEach(() => {
        sandbox = sinon.createSandbox();

        // Snapshot any existing listeners so we can restore after each test
        // (BackendApplication installs its own as part of construction).
        savedListeners = {};
        for (const evt of PROCESS_EVENTS) {
            savedListeners[evt] = [...process.listeners(evt as NodeJS.Signals)] as AnyListener[];
            process.removeAllListeners(evt);
        }

        exitStub = sandbox.stub(process, 'exit');
    });

    afterEach(() => {
        for (const evt of PROCESS_EVENTS) {
            process.removeAllListeners(evt);
            for (const listener of savedListeners[evt] ?? []) {
                process.on(evt, listener);
            }
        }

        sandbox.restore();
    });

    function createTestContainer(): Container {
        const container = new Container();

        container.bind(RootContainer).toConstantValue(container);

        container.bind(ILogger).to(MockLogger).inSingletonScope();
        container.bind(Stopwatch).to(NodeStopwatch).inSingletonScope();
        container.bind(ProcessUtils).toSelf().inSingletonScope();
        container.bind(BackendApplicationCliContribution).toSelf().inSingletonScope();
        container.bind(CliContribution).toService(BackendApplicationCliContribution);
        bindContributionProvider(container, BackendApplicationContribution);

        container.bind(TestBackendApplication).toSelf().inSingletonScope();
        container.bind(BackendApplication).toService(TestBackendApplication);

        return container;
    }

    describe('graceful shutdown', () => {

        it('runs @preDestroy on root-scoped singletons before exiting with code 1', async () => {
            let canaryDisposed = false;

            @injectable()
            class Canary {
                @preDestroy()
                protected onPreDestroy(): void {
                    canaryDisposed = true;
                }
            }

            const container = createTestContainer();
            const canaryModule = new ContainerModule(bind => {
                bind(Canary).toSelf().inSingletonScope();
            });
            container.load(canaryModule);
            container.get(Canary);

            const app = container.get(TestBackendApplication);

            await app.invokeGracefulShutdown();

            expect(canaryDisposed, '@preDestroy was not invoked on root-scoped singleton').to.be.true;
            expect(exitStub.calledOnceWith(1), 'process.exit(1) was not called exactly once').to.be.true;
        });

        it('is idempotent: a second invocation does not unbind the container twice', async () => {
            const container = createTestContainer();
            const unbindSpy = sandbox.spy(container, 'unbindAllAsync');

            const app = container.get(TestBackendApplication);

            await app.invokeGracefulShutdown();
            await app.invokeGracefulShutdown();

            expect(unbindSpy.callCount, 'unbindAllAsync should be called only once').to.equal(1);
            expect(exitStub.callCount, 'process.exit should be called only once').to.equal(1);
        });

        it('still exits if container cleanup rejects', async () => {
            const container = createTestContainer();
            const cleanupError = new Error('cleanup boom');
            sandbox.stub(container, 'unbindAllAsync').rejects(cleanupError);
            const warnStub = sandbox.stub(console, 'warn');

            const app = container.get(TestBackendApplication);

            await app.invokeGracefulShutdown();

            expect(exitStub.calledOnceWith(1), 'process.exit(1) was not called').to.be.true;
            expect(warnStub.calledOnce, 'a warning should be logged when cleanup rejects').to.be.true;
            expect(warnStub.firstCall.args[0]).to.match(/cleanup boom/);
        });

        it('exits even when container cleanup hangs past the timeout', async () => {
            const clock = sandbox.useFakeTimers();
            const container = createTestContainer();
            sandbox.stub(container, 'unbindAllAsync').returns(new Promise<void>(() => { /* never */ }));
            const warnStub = sandbox.stub(console, 'warn');

            const app = container.get(TestBackendApplication);

            const shutdownPromise = app.invokeGracefulShutdown();

            await clock.tickAsync(5001);
            await shutdownPromise;

            expect(exitStub.calledOnceWith(1), 'process.exit(1) was not called after timeout').to.be.true;
            expect(warnStub.calledOnce, 'a warning should be logged on timeout').to.be.true;
            expect(warnStub.firstCall.args[0]).to.match(/timed out/);
        });

        it('awaits async onStop contributions before unbinding the container', async () => {
            const container = createTestContainer();
            const onStopDeferred = new Deferred<void>();
            container.bind(BackendApplicationContribution).toConstantValue({
                onStop: () => onStopDeferred.promise
            });
            const unbindSpy = sandbox.spy(container, 'unbindAllAsync');

            const app = container.get(TestBackendApplication);
            const shutdownPromise = app.invokeGracefulShutdown();

            expect(unbindSpy.called, 'unbindAllAsync should not run before onStop resolves').to.be.false;

            onStopDeferred.resolve();
            await shutdownPromise;

            expect(unbindSpy.calledOnce, 'unbindAllAsync should run once onStop completes').to.be.true;
            expect(exitStub.calledOnceWith(1)).to.be.true;
        });

        it('invokes onStop hooks while injected services are still resolvable', async () => {
            @injectable()
            class Helper {
                readonly value = 'still-bound';
            }

            const container = createTestContainer();
            container.bind(Helper).toSelf().inSingletonScope();

            let observed: string | undefined;
            container.bind(BackendApplicationContribution).toConstantValue({
                onStop: () => {
                    observed = container.get(Helper).value;
                }
            });

            const app = container.get(TestBackendApplication);
            await app.invokeGracefulShutdown();

            expect(observed, 'onStop should observe injected services that are still bound').to.equal('still-bound');
        });

        it('proceeds with shutdown when onStop hooks exceed the timeout', async () => {
            const clock = sandbox.useFakeTimers();
            const container = createTestContainer();
            container.bind(BackendApplicationContribution).toConstantValue({
                onStop: () => new Promise<void>(() => { /* never */ })
            });
            const unbindSpy = sandbox.spy(container, 'unbindAllAsync');
            const warnStub = sandbox.stub(console, 'warn');

            const app = container.get(TestBackendApplication);
            const shutdownPromise = app.invokeGracefulShutdown();

            await clock.tickAsync(5001);
            await shutdownPromise;

            expect(warnStub.calledOnce, 'a warning should be logged on onStop timeout').to.be.true;
            expect(warnStub.firstCall.args[0]).to.match(/Stopping backend contributions/);
            expect(unbindSpy.calledOnce, 'unbind should still run after onStop times out').to.be.true;
            expect(exitStub.calledOnceWith(1)).to.be.true;
        });

        it('runs all contributions even when one onStop rejects', async () => {
            const container = createTestContainer();
            let secondRan = false;
            container.bind(BackendApplicationContribution).toConstantValue({
                onStop: async () => { throw new Error('boom'); }
            });
            container.bind(BackendApplicationContribution).toConstantValue({
                onStop: () => { secondRan = true; }
            });
            const errorStub = sandbox.stub(console, 'error');

            const app = container.get(TestBackendApplication);
            await app.invokeGracefulShutdown();

            expect(secondRan, 'second contribution should still be stopped after first rejects').to.be.true;
            expect(errorStub.calledWithMatch('Could not stop contribution')).to.be.true;
        });

        it('is idempotent when a contribution re-enters graceful shutdown', async () => {
            const container = createTestContainer();
            // Indirected through a holder so the contribution closure can refer to the
            // application instance that is constructed after the binding is recorded.
            const appHolder: { current?: TestBackendApplication } = {};
            container.bind(BackendApplicationContribution).toConstantValue({
                onStop: () => appHolder.current!.invokeGracefulShutdown()
            });
            const unbindSpy = sandbox.spy(container, 'unbindAllAsync');

            appHolder.current = container.get(TestBackendApplication);
            await appHolder.current.invokeGracefulShutdown();

            expect(unbindSpy.callCount, 'unbindAllAsync should be called only once').to.equal(1);
            expect(exitStub.callCount, 'process.exit should be called only once').to.equal(1);
        });

    });

    describe('process exit handler', () => {

        it('does not re-invoke contributions after graceful shutdown ran them', async () => {
            const container = createTestContainer();
            const onStopSpy = sandbox.spy();
            container.bind(BackendApplicationContribution).toConstantValue({ onStop: onStopSpy });
            const terminateStub = sandbox.stub(ProcessUtils.prototype, 'terminateProcessTree');

            const app = container.get(TestBackendApplication);
            const exitListener = process.listeners('exit')[0] as () => void;

            await app.invokeGracefulShutdown();
            expect(onStopSpy.callCount, 'contribution onStop should fire from gracefulShutdown').to.equal(1);

            exitListener();

            expect(onStopSpy.callCount, 'contribution onStop should not be invoked a second time').to.equal(1);
            expect(terminateStub.called, 'terminateProcessTree should be invoked by the exit handler').to.be.true;
        });

        it('invokes contributions synchronously when graceful shutdown was bypassed', () => {
            const container = createTestContainer();
            const onStopSpy = sandbox.spy();
            container.bind(BackendApplicationContribution).toConstantValue({ onStop: onStopSpy });
            const terminateStub = sandbox.stub(ProcessUtils.prototype, 'terminateProcessTree');

            container.get(TestBackendApplication);
            const exitListener = process.listeners('exit')[0] as () => void;

            exitListener();

            expect(onStopSpy.calledOnce, 'sync exit path should still invoke contributions').to.be.true;
            expect(terminateStub.called, 'terminateProcessTree should be invoked').to.be.true;
        });

    });

});
