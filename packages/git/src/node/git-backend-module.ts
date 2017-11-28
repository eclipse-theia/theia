/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule, Container, interfaces } from 'inversify';
import { Git, GitPath } from '../common/git';
import { GitWatcherPath, GitWatcherClient, GitWatcherServer } from '../common/git-watcher';
import { DugiteGit } from './dugite-git';
import { DugiteGitWatcherServer } from './dugite-git-watcher';
import { ConnectionHandler, JsonRpcConnectionHandler } from "@theia/core/lib/common";
import { GitRepositoryManager } from './git-repository-manager';
import { GitRepositoryWatcherFactory, GitRepositoryWatcherOptions, GitRepositoryWatcher } from './git-repository-watcher';
import { GitRepositoryLocator } from './git-repository-locator';

export function bindGit(bind: interfaces.Bind): void {
    bind(GitRepositoryManager).toSelf().inSingletonScope();
    bind(GitRepositoryWatcherFactory).toFactory(ctx => (options: GitRepositoryWatcherOptions) => {
        const child = new Container({ defaultScope: 'Singleton' });
        child.parent = ctx.container;
        child.bind(GitRepositoryWatcher).toSelf();
        child.bind(GitRepositoryWatcherOptions).toConstantValue(options);
        return child.get(GitRepositoryWatcher);
    });
    bind(GitRepositoryLocator).toSelf().inSingletonScope();
    bind(DugiteGit).toSelf().inSingletonScope();
    bind(Git).toDynamicValue(ctx => ctx.container.get(DugiteGit)).inSingletonScope();
}

export default new ContainerModule(bind => {
    bindGit(bind);
    bind(ConnectionHandler).toDynamicValue(context => new JsonRpcConnectionHandler(GitPath, () => context.container.get(Git))).inSingletonScope();

    bind(DugiteGitWatcherServer).toSelf();
    bind(GitWatcherServer).toDynamicValue(context => context.container.get(DugiteGitWatcherServer));
    bind(ConnectionHandler).toDynamicValue(context =>
        new JsonRpcConnectionHandler<GitWatcherClient>(GitWatcherPath, client => {
            const server = context.container.get<GitWatcherServer>(GitWatcherServer);
            server.setClient(client);
            client.onDidCloseConnection(() => server.dispose());
            return server;
        })
    ).inSingletonScope();
});
