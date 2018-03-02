/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as cluster from 'cluster';
import { ContainerModule, Container, interfaces } from 'inversify';
import { Git, GitPath } from '../common/git';
import { GitWatcherPath, GitWatcherClient, GitWatcherServer } from '../common/git-watcher';
import { DugiteGit, OutputParser, NameStatusParser, CommitDetailsParser, GitBlameParser } from './dugite-git';
import { DugiteGitWatcherServer } from './dugite-git-watcher';
import { ConnectionHandler, JsonRpcConnectionHandler, ILogger } from "@theia/core/lib/common";
import { GitRepositoryManager } from './git-repository-manager';
import { GitRepositoryWatcherFactory, GitRepositoryWatcherOptions, GitRepositoryWatcher } from './git-repository-watcher';
import { GitLocator } from './git-locator/git-locator-protocol';
import { GitLocatorClient } from './git-locator/git-locator-client';
import { GitLocatorImpl } from './git-locator/git-locator-impl';

export interface GitBindingOptions {
    readonly bindManager: (binding: interfaces.BindingToSyntax<{}>) => interfaces.BindingWhenOnSyntax<{}>;
}

export namespace GitBindingOptions {
    export const Default: GitBindingOptions = {
        bindManager(binding: interfaces.BindingToSyntax<{}>): interfaces.BindingWhenOnSyntax<{}> {
            return binding.to(GitRepositoryManager).inSingletonScope();
        }
    };
}

export function bindGit(bind: interfaces.Bind, bindingOptions: GitBindingOptions = GitBindingOptions.Default): void {
    bindingOptions.bindManager(bind(GitRepositoryManager));
    bind(GitRepositoryWatcherFactory).toFactory(ctx => (options: GitRepositoryWatcherOptions) => {
        const child = new Container({ defaultScope: 'Singleton' });
        child.parent = ctx.container;
        child.bind(GitRepositoryWatcher).toSelf();
        child.bind(GitRepositoryWatcherOptions).toConstantValue(options);
        return child.get(GitRepositoryWatcher);
    });
    if (cluster.isMaster) {
        bind(GitLocator).toDynamicValue(ctx => {
            const logger = ctx.container.get<ILogger>(ILogger);
            return new GitLocatorImpl({
                info: (message, ...args) => logger.info(message, ...args),
                error: (message, ...args) => logger.error(message, ...args)
            });
        });
    } else {
        bind(GitLocator).to(GitLocatorClient);
    }
    bind(DugiteGit).toSelf();
    bind(OutputParser).toSelf();
    bind(NameStatusParser).toSelf();
    bind(CommitDetailsParser).toSelf();
    bind(GitBlameParser).toSelf();
    bind(Git).toDynamicValue(ctx => ctx.container.get(DugiteGit));
}

export function bindRepositoryWatcher(bind: interfaces.Bind): void {
    bind(DugiteGitWatcherServer).toSelf();
    bind(GitWatcherServer).toDynamicValue(context => context.container.get(DugiteGitWatcherServer));
}

export default new ContainerModule(bind => {
    bindGit(bind);
    bind(ConnectionHandler).toDynamicValue(context =>
        new JsonRpcConnectionHandler(GitPath, client => {
            const server = context.container.get<Git>(Git);
            client.onDidCloseConnection(() => server.dispose());
            return server;
        })
    ).inSingletonScope();

    bindRepositoryWatcher(bind);
    bind(ConnectionHandler).toDynamicValue(context =>
        new JsonRpcConnectionHandler<GitWatcherClient>(GitWatcherPath, client => {
            const server = context.container.get<GitWatcherServer>(GitWatcherServer);
            server.setClient(client);
            client.onDidCloseConnection(() => server.dispose());
            return server;
        })
    ).inSingletonScope();
});
