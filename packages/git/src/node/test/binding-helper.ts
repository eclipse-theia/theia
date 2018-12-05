/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { Container, interfaces } from 'inversify';
import { Git } from '../../common/git';
import { DugiteGit } from '../dugite-git';
import { bindGit, GitBindingOptions } from '../git-backend-module';
import { bindLogger } from '@theia/core/lib/node/logger-backend-module';
import { NoSyncRepositoryManager } from '.././test/no-sync-repository-manager';
import { GitEnvProvider, DefaultGitEnvProvider } from '../env/git-env-provider';
import { GitInit, DefaultGitInit } from '../init/git-init';

// tslint:disable-next-line:no-any
export function initializeBindings(): { container: Container, bind: interfaces.Bind } {
    const container = new Container();
    const bind = container.bind.bind(container);
    bind(DefaultGitEnvProvider).toSelf().inRequestScope();
    bind(GitEnvProvider).toService(DefaultGitEnvProvider);
    bind(DefaultGitInit).toSelf();
    bind(GitInit).toService(DefaultGitInit);
    bindLogger(bind);
    return { container, bind };
}

export async function createGit(bindingOptions: GitBindingOptions = GitBindingOptions.Default): Promise<Git> {
    const { container, bind } = initializeBindings();
    bindGit(bind, {
        bindManager(binding: interfaces.BindingToSyntax<{}>): interfaces.BindingWhenOnSyntax<{}> {
            return binding.to(NoSyncRepositoryManager).inSingletonScope();
        }
    });
    return container.get(DugiteGit);
}
