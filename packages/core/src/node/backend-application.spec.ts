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

const SIGNALS = ['SIGINT', 'SIGTERM', 'exit'] as const;
type ProcessListeners = {
    exit: NodeJS.ExitListener[];
} & {
    [K in Extract<NodeJS.Signals, typeof SIGNALS[number]>]: NodeJS.SignalsListener[];
};

describe('BackendApplication', () => {
    let sandbox: sinon.SinonSandbox;
    let exitStub: sinon.SinonStub;
    let savedListeners: Partial<ProcessListeners>;

    beforeEach(() => {
        sandbox = sinon.createSandbox();

        // Snapshot any existing signal listeners so we can restore after each test
        // (BackendApplication installs its own as part of construction).
        savedListeners = {
            SIGINT: [...process.listeners('SIGINT')],
            SIGTERM: [...process.listeners('SIGTERM')],
            exit: [...process.listeners('exit')]
        };
        for (const sig of SIGNALS) {
            process.removeAllListeners(sig);
        }

        exitStub = sandbox.stub(process, 'exit');
    });

    afterEach(() => {
        for (const sig of SIGNALS) {
            process.removeAllListeners(sig);
            for (const listener of savedListeners[sig] ?? []) {
                process.on(sig, listener);
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

    });

});
