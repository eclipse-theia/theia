// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

import { injectable, inject, named, interfaces, Container } from 'inversify';
import { ContributionProvider, ConnectionHandler, bindContributionProvider, servicesPath } from '../../common';
import { MessagingService } from './messaging-service';
import { ConnectionContainerModule } from './connection-container-module';
import Route = require('route-parser');
import { Channel, ChannelMultiplexer } from '../../common/message-rpc/channel';
import { FrontendConnectionService } from './frontend-connection-service';
import { BackendApplicationContribution } from '../backend-application';

export const MessagingContainer = Symbol('MessagingContainer');
export const MainChannel = Symbol('MainChannel');

@injectable()
export class DefaultMessagingService implements MessagingService, BackendApplicationContribution {
    @inject(MessagingContainer)
    protected readonly container: interfaces.Container;

    @inject(FrontendConnectionService)
    protected readonly frontendConnectionService: FrontendConnectionService;

    @inject(ContributionProvider) @named(ConnectionContainerModule)
    protected readonly connectionModules: ContributionProvider<interfaces.ContainerModule>;

    @inject(ContributionProvider) @named(MessagingService.Contribution)
    protected readonly contributions: ContributionProvider<MessagingService.Contribution>;

    protected readonly channelHandlers = new ConnectionHandlers<Channel>();

    initialize(): void {
        this.registerConnectionHandler(servicesPath, (_, socket) => this.handleConnection(socket));
        for (const contribution of this.contributions.getContributions()) {
            contribution.configure(this);
        }
    }

    registerConnectionHandler(path: string, callback: (params: MessagingService.PathParams, mainChannel: Channel) => void): void {
        this.frontendConnectionService.registerConnectionHandler(path, callback);
    }

    registerChannelHandler(spec: string, callback: (params: MessagingService.PathParams, channel: Channel) => void): void {
        this.channelHandlers.push(spec, (params, channel) => callback(params, channel));
    }

    protected handleConnection(channel: Channel): void {
        const multiplexer = new ChannelMultiplexer(channel);
        const channelHandlers = this.getConnectionChannelHandlers(channel);
        multiplexer.onDidOpenChannel(event => {
            if (channelHandlers.route(event.id, event.channel)) {
                console.debug(`Opening channel for service path '${event.id}'.`);
                event.channel.onClose(() => console.info(`Closing channel on service path '${event.id}'.`));
            }
        });
    }

    protected createMainChannelContainer(socket: Channel): Container {
        const connectionContainer: Container = this.container.createChild() as Container;
        connectionContainer.bind(MainChannel).toConstantValue(socket);
        return connectionContainer;
    }

    protected getConnectionChannelHandlers(socket: Channel): ConnectionHandlers<Channel> {
        const connectionContainer = this.createMainChannelContainer(socket);
        bindContributionProvider(connectionContainer, ConnectionHandler);
        connectionContainer.load(...this.connectionModules.getContributions());
        const connectionChannelHandlers = new ConnectionHandlers<Channel>(this.channelHandlers);
        const connectionHandlers = connectionContainer.getNamed<ContributionProvider<ConnectionHandler>>(ContributionProvider, ConnectionHandler);
        for (const connectionHandler of connectionHandlers.getContributions(true)) {
            connectionChannelHandlers.push(connectionHandler.path, (_, channel) => {
                connectionHandler.onConnection(channel);
            });
        }
        return connectionChannelHandlers;
    }

}

export class ConnectionHandlers<T> {
    protected readonly handlers: ((path: string, connection: T) => string | false)[] = [];

    constructor(
        protected readonly parent?: ConnectionHandlers<T>
    ) { }

    push(spec: string, callback: (params: MessagingService.PathParams, connection: T) => void): void {
        const route = new Route(spec);
        const handler = (path: string, channel: T): string | false => {
            const params = route.match(path);
            if (!params) {
                return false;
            }
            callback(params, channel);
            return route.reverse(params);
        };
        this.handlers.push(handler);
    }

    route(path: string, connection: T): string | false {
        for (const handler of this.handlers) {
            try {
                const result = handler(path, connection);
                if (result) {
                    return result;
                }
            } catch (e) {
                console.error(e);
            }
        }
        if (this.parent) {
            return this.parent.route(path, connection);
        }
        return false;
    }
}
