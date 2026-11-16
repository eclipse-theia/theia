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
import { Container, injectable, preDestroy } from 'inversify';
import { ConnectionHandler, bindContributionProvider, servicesPath, ILogger } from '../../../common/index.js';
import { BasicChannel, Channel, ChannelMultiplexer } from '../../../common/message-rpc/channel.js';
import { Uint8ArrayWriteBuffer } from '../../../common/message-rpc/uint8-array-message-buffer.js';
import { ConnectionContainerModule } from '../connection-container-module.js';
import { ConnectionHandlers, DefaultMessagingService, MessagingContainer } from '../default-messaging-service.js';
import { FrontendConnectionService } from '../frontend-connection-service.js';
import { MessagingService } from '../messaging-service.js';
import { MockLogger } from '../../../common/test/mock-logger.js';
import { ChannelPipe } from '../../../common/message-rpc/channel.spec.js';
import { Deferred } from '../../../common/promise-util.js';
import { ShellEnvironmentResolution, ShellEnvironmentServer } from '../../../common/shell-environment.js';

describe('DefaultMessagingService', () => {

    describe('when a frontend connection closes', () => {

        it('disposes the connection-scoped child container, invoking @preDestroy on bound singleton services', async () => {
            let canaryDisposed = false;

            @injectable()
            class CanaryConnectionHandler implements ConnectionHandler {
                readonly path = 'canary';
                onConnection(_channel: Channel): void { /* not relevant for this test */ }

                @preDestroy()
                protected onPreDestroy(): void {
                    canaryDisposed = true;
                }
            }

            const canaryModule = ConnectionContainerModule.create(({ bind }) => {
                bind(CanaryConnectionHandler).toSelf().inSingletonScope();
                bind(ConnectionHandler).toService(CanaryConnectionHandler);
            });

            const container = new Container();
            container.bind(MessagingContainer).toConstantValue(container);
            container.bind(DefaultMessagingService).toSelf().inSingletonScope();
            container.bind(ConnectionContainerModule).toConstantValue(canaryModule);
            bindContributionProvider(container, ConnectionContainerModule);
            bindContributionProvider(container, MessagingService.Contribution);

            let serviceHandler: ((params: MessagingService.PathParams, mainChannel: Channel) => void) | undefined;
            const frontendConnectionService: FrontendConnectionService = {
                registerConnectionHandler(path, callback): void {
                    if (path === servicesPath) {
                        serviceHandler = callback;
                    }
                }
            };
            container.bind(FrontendConnectionService).toConstantValue(frontendConnectionService);
            container.bind(ILogger).to(MockLogger).inSingletonScope();
            container.bind(ShellEnvironmentServer).toConstantValue(<ShellEnvironmentServer>{
                whenResolved: async () => ({ status: 'skipped', reason: 'test' }),
                setResolutionTimeout: async () => { }
            });

            const messagingService = container.get(DefaultMessagingService);
            messagingService.initialize();

            expect(serviceHandler, 'connection handler not registered on the services path').to.not.be.undefined;

            const mainChannel = new BasicChannel(() => new Uint8ArrayWriteBuffer());
            serviceHandler!({}, mainChannel);

            expect(canaryDisposed, 'canary should not be disposed before the channel is closed').to.be.false;

            mainChannel.onCloseEmitter.fire({ reason: 'frontend connection closed' });
            await new Promise<void>(resolve => setImmediate(resolve));

            expect(canaryDisposed, 'canary @preDestroy was not invoked').to.be.true;
        });

    });

    describe('when a frontend opens service channels', () => {

        let resolution: Deferred<ShellEnvironmentResolution>;
        let connections: ((params: MessagingService.PathParams, mainChannel: Channel) => void)[];
        let connected: string[];

        const setup = (): DefaultMessagingService => {
            resolution = new Deferred();
            connections = [];
            connected = [];
            const container = new Container({ defaultScope: 'Singleton' });
            container.bind(ILogger).to(MockLogger);
            container.bind(MessagingContainer).toConstantValue(container);
            container.bind(FrontendConnectionService).toConstantValue(<FrontendConnectionService>{
                registerConnectionHandler: (path, callback) => { connections.push(callback); }
            });
            bindContributionProvider(container, ConnectionContainerModule);
            bindContributionProvider(container, MessagingService.Contribution);
            container.bind(ShellEnvironmentServer).toConstantValue(<ShellEnvironmentServer>{
                whenResolved: () => resolution.promise,
                setResolutionTimeout: async () => { }
            });
            const handler = (path: string, independentOfShellEnvironment?: boolean): ConnectionHandler => ({
                path, independentOfShellEnvironment, onConnection: () => { connected.push(path); }
            });
            container.bind(ConnectionHandler).toConstantValue(handler('/services/task'));
            container.bind(ConnectionHandler).toConstantValue(handler('/services/filesystem', true));
            container.bind(DefaultMessagingService).toSelf();
            const service = container.get(DefaultMessagingService);
            service.initialize();
            return service;
        };

        it('holds the services that depend on the shell environment and lets the others through', async () => {
            const service = setup();
            service.registerChannelHandler('/services/terminals/:id', ({ id }) => { connected.push(`/services/terminals/${id}`); });
            service.registerChannelHandler('/services/keyboard', () => { connected.push('/services/keyboard'); }, { independentOfShellEnvironment: true });
            expect(connections).to.have.lengthOf(1);
            const pipe = new ChannelPipe();
            connections[0]({}, pipe.right);
            const frontend = new ChannelMultiplexer(pipe.left);
            const held = Promise.all([frontend.open('/services/task'), frontend.open('/services/terminals/1')]);
            await Promise.all([frontend.open('/services/filesystem'), frontend.open('/services/keyboard')]);
            expect(connected).to.have.members(['/services/filesystem', '/services/keyboard']);
            resolution.resolve({ status: 'applied' });
            await held;
            expect(connected).to.have.members(['/services/filesystem', '/services/keyboard', '/services/task', '/services/terminals/1']);
        });
    });
});

describe('ConnectionHandlers', () => {

    it('holds every path until the shell environment is resolved unless its handler is declared independent of it', () => {
        const handlers = new ConnectionHandlers<string>();
        handlers.push('/services/terminals/:id', () => { });
        handlers.push('/services/filesystem', () => { }, { independentOfShellEnvironment: true });
        expect(handlers.isIndependentOfShellEnvironment('/services/terminals/42')).to.be.false;
        expect(handlers.isIndependentOfShellEnvironment('/services/filesystem')).to.be.true;
        expect(handlers.isIndependentOfShellEnvironment('/services/unknown')).to.be.false;
    });

    it('consults the parent handlers', () => {
        const parent = new ConnectionHandlers<string>();
        parent.push('/services/os', () => { }, { independentOfShellEnvironment: true });
        const child = new ConnectionHandlers<string>(parent);
        child.push('/services/task', () => { });
        expect(child.isIndependentOfShellEnvironment('/services/os')).to.be.true;
        expect(child.isIndependentOfShellEnvironment('/services/task')).to.be.false;
    });

    it('does not invoke the handlers when asked about their independence', () => {
        let invoked = 0;
        const handlers = new ConnectionHandlers<string>();
        handlers.push('/services/:name', () => { invoked++; }, { independentOfShellEnvironment: true });
        expect(handlers.isIndependentOfShellEnvironment('/services/anything')).to.be.true;
        expect(invoked).to.equal(0);
        expect(handlers.route('/services/anything', 'connection')).to.equal('/services/anything');
        expect(invoked).to.equal(1);
    });
});
