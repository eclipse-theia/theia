/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Git, GitPath } from '../common/git';
import { GitWatcher, GitWatcherClient, GitWatcherServer } from '../common/git-watcher';
import { DugiteGit } from './dugite-git';
import { DugiteGitWatcherServer } from './dugite-git-watcher';
import { ContainerModule } from 'inversify';
import { bindGitPreferences } from '../common/git-preferences';
import { ConnectionHandler, JsonRpcConnectionHandler } from "@theia/core/lib/common";

export default new ContainerModule(bind => {
    bindGitPreferences(bind);
    bind(DugiteGit).toSelf().inSingletonScope();
    bind(Git).toDynamicValue(ctx => ctx.container.get(DugiteGit)).inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(context => new JsonRpcConnectionHandler(GitPath, () => context.container.get(Git))).inSingletonScope();
    bind(DugiteGitWatcherServer);
    bind(GitWatcherServer).toDynamicValue(context => context.container.get(DugiteGitWatcherServer));
    bind(GitWatcher).toSelf();
    bind(ConnectionHandler).toDynamicValue(context =>
        new JsonRpcConnectionHandler<GitWatcherClient>(GitPath, client => {
            const server = context.container.get<GitWatcherServer>(GitWatcherServer);
            server.setClient(client);
            client.onDidCloseConnection(() => server.dispose());
            return server;
        })
    ).inSingletonScope();
});
