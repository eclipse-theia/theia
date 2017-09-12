/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Git, GitPath } from '../common/git';
import { ContainerModule } from 'inversify';
import { bindGitPreferences } from '../common/git-preferences';
import { WebSocketConnectionProvider, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { GitCommandHandlers } from './git-command';
import { GitKeybindingContext, GitKeybindingContribution } from './git-keybinding';
import { CommandContribution, KeybindingContribution, KeybindingContext, MenuContribution } from "@theia/core/lib/common";
import { GitWatcher, GitWatcherPath, GitWatcherServer, GitWatcherServerProxy, ReconnectingGitWatcherServer } from '../common/git-watcher';
import { GitFrontendContribution } from './git-frontend-contribution';
import { GitWidget } from './git-widget';
import { GitContextMenu } from './git-context-menu';

import '../../src/browser/style/index.css';

export default new ContainerModule(bind => {
    bindGitPreferences(bind);
    bind(GitWatcherServerProxy).toDynamicValue(context => WebSocketConnectionProvider.createProxy(context.container, GitWatcherPath)).inSingletonScope();
    bind(GitWatcherServer).to(ReconnectingGitWatcherServer).inSingletonScope();
    bind(GitWatcher).toSelf().inSingletonScope();
    bind(Git).toDynamicValue(context => WebSocketConnectionProvider.createProxy(context.container, GitPath)).inSingletonScope();

    bind(CommandContribution).to(GitCommandHandlers);
    bind(MenuContribution).to(GitContextMenu);
    bind(GitKeybindingContext).toSelf().inSingletonScope();
    bind(KeybindingContext).toDynamicValue(context => context.container.get(GitKeybindingContext));
    bind(KeybindingContribution).to(GitKeybindingContribution);

    bind(FrontendApplicationContribution).to(GitFrontendContribution);
    bind(GitWidget).toSelf().inSingletonScope();
});
