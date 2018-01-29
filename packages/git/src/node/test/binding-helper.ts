/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Container, interfaces } from 'inversify';
import { Git } from '../../common/git';
import { DugiteGit } from '../dugite-git';
import { bindGit, GitBindingOptions } from '../git-backend-module';
import { bindLogger } from '@theia/core/lib/node/logger-backend-module';
import { ILoggerServer } from '@theia/core/lib/common/logger-protocol';
import { ConsoleLoggerServer } from '@theia/core/lib/common/console-logger-server';
import { NoSyncRepositoryManager } from '.././test/no-sync-repository-manager';

// tslint:disable-next-line:no-any
export function initializeBindings(): { container: Container, bind: any } {
    const container = new Container();
    const bind = container.bind.bind(container);
    bindLogger(bind);
    container.rebind(ILoggerServer).to(ConsoleLoggerServer).inSingletonScope();
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
