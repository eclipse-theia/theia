// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule, interfaces } from '@theia/core/shared/inversify';
import { fork } from 'child_process';
import { join } from 'path';
import { Git, GitPath } from '../common/git';
import { GitWatcherPath, GitWatcherServer } from '../common/git-watcher';
import { DugiteGit, OutputParser, NameStatusParser, CommitDetailsParser, GitBlameParser } from './dugite-git';
import { DugiteGitWatcherServer } from './dugite-git-watcher';
import { ILogger, ServiceContribution, BackendAndFrontend } from '@theia/core/lib/common';
import { GitRepositoryManager } from './git-repository-manager';
import { GitRepositoryWatcherFactory, GitRepositoryWatcherOptions, GitRepositoryWatcher } from './git-repository-watcher';
import { GitLocator } from './git-locator-protocol';
import { GitLocatorImpl } from './git-locator-impl';
import { GitExecProvider } from './git-exec-provider';
import { DefaultGitInit, GitInit } from './init/git-init';
import { cluster, JsonRpcIpcProxyProvider } from '@theia/core/lib/node';

export default new ContainerModule(bind => {
    bindGit(bind);
    bindRepositoryWatcher(bind);
    bind(ServiceContribution)
        .toDynamicValue(ctx => ({
            [GitPath]: () => ctx.container.get(DugiteGit),
            [GitWatcherPath]: () => ctx.container.get(GitWatcherServer)
        }))
        .inSingletonScope()
        .whenTargetNamed(BackendAndFrontend);
});

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
        // GitRepositoryWatcherFactory is injected into the singleton GitRepositoryManager only.
        // GitRepositoryWatcher instances created there should be able to access the (singleton) Git.
        const child = ctx.container.createChild();
        child.bind(GitRepositoryWatcher).toSelf();
        child.bind(GitRepositoryWatcherOptions).toConstantValue(options);
        return child.get(GitRepositoryWatcher);
    });
    if (!cluster) {
        bind(GitLocator)
            .toDynamicValue(ctx => {
                const logger = ctx.container.get<ILogger>(ILogger);
                return new GitLocatorImpl(logger);
            })
            .inSingletonScope();
    } else {
        bind(GitLocator)
            .toDynamicValue(ctx => ctx.container.get(JsonRpcIpcProxyProvider).createIpcProxy(
                'git-locator',
                ipc => fork(join(__dirname, '..', 'git-locator-server', 'main'), {
                    silent: true,
                    env: ipc.createEnv(),
                    execArgv: ipc.createExecArgv()
                })
            ))
            .inSingletonScope();
    }
    bind(OutputParser).toSelf().inSingletonScope();
    bind(NameStatusParser).toSelf().inSingletonScope();
    bind(CommitDetailsParser).toSelf().inSingletonScope();
    bind(GitBlameParser).toSelf().inSingletonScope();
    bind(GitExecProvider).toSelf().inSingletonScope();
    bind(DugiteGit).toSelf().inSingletonScope();
    bind(Git).toService(DugiteGit);
    bind(DefaultGitInit).toSelf();
    bind(GitInit).toService(DefaultGitInit);
}

export function bindRepositoryWatcher(bind: interfaces.Bind): void {
    bind(GitWatcherServer).to(DugiteGitWatcherServer).inSingletonScope();
}
