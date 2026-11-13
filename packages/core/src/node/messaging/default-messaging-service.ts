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
import { ContributionProvider, ConnectionHandler, bindContributionProvider, servicesPath } from '../../common/index.js';
import { MessagingService } from './messaging-service.js';
import { ConnectionContainerModule } from './connection-container-module.js';
import Route from 'route-parser';
import { Channel, ChannelMultiplexer } from '../../common/message-rpc/channel.js';
import { FrontendConnectionService } from './frontend-connection-service.js';
import { BackendApplicationContribution } from '../backend-application.js';
import { ILogger } from '../../common/logger.js';
import { ShellEnvironmentServer } from '../../common/shell-environment.js';
import { GatedChannelMultiplexer } from './gated-channel-multiplexer.js';

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

    @inject(ILogger) @named('core:DefaultMessagingService')
    protected readonly logger: ILogger;

    @inject(ContributionProvider) @named(MessagingService.Contribution)
    protected readonly contributions: ContributionProvider<MessagingService.Contribution>;

    @inject(ShellEnvironmentServer)
    protected readonly shellEnvironment: ShellEnvironmentServer;

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

    registerChannelHandler(spec: string, callback: (params: MessagingService.PathParams, channel: Channel) => void, options?: MessagingService.ChannelHandlerOptions): void {
        this.channelHandlers.push(spec, (params, channel) => callback(params, channel), options);
    }

    protected handleConnection(channel: Channel): void {
        const channelHandlers = this.getConnectionChannelHandlers(channel);
        const multiplexer = this.createChannelMultiplexer(channel, channelHandlers);
        multiplexer.onDidOpenChannel(event => {
            if (channelHandlers.route(event.id, event.channel)) {
                this.logger.debug(`Opening channel for service path '${event.id}'.`);
                event.channel.onClose(() => this.logger.info(`Closing channel on service path '${event.id}'.`));
            }
        });
    }

    /**
     * Creates the multiplexer of the service channels on the main channel of a frontend. It holds the channels of the
     * services that depend on the environment of the user's login shell until that environment is known, see {@link holdChannel}.
     */
    protected createChannelMultiplexer(mainChannel: Channel, channelHandlers: ConnectionHandlers<Channel>): ChannelMultiplexer {
        return new GatedChannelMultiplexer(mainChannel, id => this.holdChannel(id, channelHandlers));
    }

    /**
     * Holds the opening of a service channel until the `PATH` of the user's login shell has been applied to `process.env`,
     * unless the service is declared independent of it (see `ConnectionHandler.independentOfShellEnvironment`). Terminals, tasks,
     * debug sessions, the plugin host and whatever else runs the user's tools are requested through these channels, so by the
     * time a request arrives, they find those tools. In a browser deployment and on Windows, nothing is held.
     *
     * @returns the promise to wait for, or `undefined` if the channel is not to be held
     */
    protected holdChannel(id: string, channelHandlers: ConnectionHandlers<Channel>): Promise<void> | undefined {
        if (channelHandlers.isIndependentOfShellEnvironment(id)) {
            return undefined;
        }
        const start = performance.now();
        return this.shellEnvironment.whenResolved().then(() => {
            const held = performance.now() - start;
            if (held >= 10) {
                this.logger.debug(`Held the channel '${id}' for ${held.toFixed(0)} ms until the login shell environment was resolved.`);
            }
        });
    }

    protected createMainChannelContainer(socket: Channel): Container {
        const connectionContainer: Container = this.container.createChild() as Container;
        connectionContainer.bind(MainChannel).toConstantValue(socket);
        socket.onClose(() => connectionContainer.unbindAllAsync().catch(e => this.logger.error(e)));
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
            }, { independentOfShellEnvironment: connectionHandler.independentOfShellEnvironment });
        }
        return connectionChannelHandlers;
    }

}

export class ConnectionHandlers<T> {
    protected readonly handlers: ConnectionHandlers.Entry<T>[] = [];

    constructor(
        protected readonly parent?: ConnectionHandlers<T>
    ) { }

    push(spec: string, callback: (params: MessagingService.PathParams, connection: T) => void, options: MessagingService.ChannelHandlerOptions = {}): void {
        const route = new Route(spec);
        const handle = (path: string, channel: T): string | false => {
            const params = route.match(path);
            if (!params) {
                return false;
            }
            callback(params, channel);
            return route.reverse(params);
        };
        this.handlers.push({ route, handle, independentOfShellEnvironment: options.independentOfShellEnvironment ?? false });
    }

    route(path: string, connection: T): string | false {
        for (const { handle } of this.handlers) {
            try {
                const result = handle(path, connection);
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

    /**
     * Whether the handler of the given path is declared independent of the shell environment,
     * see {@link ConnectionHandler.independentOfShellEnvironment}. A path without a handler is not.
     */
    isIndependentOfShellEnvironment(path: string): boolean {
        const entry = this.handlers.find(({ route }) => !!route.match(path));
        if (entry) {
            return entry.independentOfShellEnvironment;
        }
        return this.parent?.isIndependentOfShellEnvironment(path) ?? false;
    }
}

export namespace ConnectionHandlers {
    export interface Entry<T> {
        readonly route: Route;
        readonly handle: (path: string, connection: T) => string | false;
        readonly independentOfShellEnvironment: boolean;
    }
}
