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
import { ConnectionHandler, bindContributionProvider, servicesPath } from '../../../common';
import { BasicChannel, Channel } from '../../../common/message-rpc/channel';
import { Uint8ArrayWriteBuffer } from '../../../common/message-rpc/uint8-array-message-buffer';
import { ConnectionContainerModule } from '../connection-container-module';
import { DefaultMessagingService, MessagingContainer } from '../default-messaging-service';
import { FrontendConnectionService } from '../frontend-connection-service';
import { MessagingService } from '../messaging-service';

describe('DefaultMessagingService', () => {

    describe('when a frontend connection closes', () => {

        it('disposes the connection-scoped child container, invoking @preDestroy on bound singleton services', () => {
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

            const messagingService = container.get(DefaultMessagingService);
            messagingService.initialize();

            expect(serviceHandler, 'connection handler not registered on the services path').to.not.be.undefined;

            const mainChannel = new BasicChannel(() => new Uint8ArrayWriteBuffer());
            serviceHandler!({}, mainChannel);

            expect(canaryDisposed, 'canary should not be disposed before the channel is closed').to.be.false;

            mainChannel.onCloseEmitter.fire({ reason: 'frontend connection closed' });

            expect(canaryDisposed, 'canary @preDestroy was not invoked').to.be.true;
        });

    });

});
