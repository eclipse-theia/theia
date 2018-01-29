/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Git, GitPath } from '../common/git';
import { ContainerModule } from 'inversify';
import { WebSocketConnectionProvider, FrontendApplicationContribution, WidgetFactory } from '@theia/core/lib/browser';
import { GitCommandHandlers } from './git-command';
import { CommandContribution, MenuContribution, ResourceResolver } from "@theia/core/lib/common";
import { GitWatcher, GitWatcherPath, GitWatcherServer, GitWatcherServerProxy, ReconnectingGitWatcherServer } from '../common/git-watcher';
import { GitFrontendContribution, GIT_WIDGET_FACTORY_ID } from './git-frontend-contribution';
import { GitWidget } from './git-widget';
import { GitResourceResolver } from './git-resource';
import { GitContextMenu } from './git-context-menu';
import { GitRepositoryProvider } from './git-repository-provider';
import { GitQuickOpenService } from './git-quick-open-service';
import { LabelProviderContribution } from '@theia/core/lib/browser/label-provider';
import { GitUriLabelProviderContribution } from './git-uri-label-contribution';
import { KeybindingContribution } from '@theia/core/lib/common/keybinding';

import '../../src/browser/style/index.css';

export default new ContainerModule(bind => {
    bind(GitWatcherServerProxy).toDynamicValue(context => WebSocketConnectionProvider.createProxy(context.container, GitWatcherPath)).inSingletonScope();
    bind(GitWatcherServer).to(ReconnectingGitWatcherServer).inSingletonScope();
    bind(GitWatcher).toSelf().inSingletonScope();
    bind(Git).toDynamicValue(context => WebSocketConnectionProvider.createProxy(context.container, GitPath)).inSingletonScope();

    bind(CommandContribution).to(GitCommandHandlers);
    bind(MenuContribution).to(GitContextMenu);

    bind(GitFrontendContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toDynamicValue(c => c.container.get(GitFrontendContribution));
    bind(CommandContribution).toDynamicValue(c => c.container.get(GitFrontendContribution));
    bind(KeybindingContribution).toDynamicValue(c => c.container.get(GitFrontendContribution));
    bind(MenuContribution).toDynamicValue(c => c.container.get(GitFrontendContribution));
    bind(GitWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(context => ({
        id: GIT_WIDGET_FACTORY_ID,
        createWidget: () => context.container.get<GitWidget>(GitWidget)
    }));

    bind(GitResourceResolver).toSelf().inSingletonScope();
    bind(ResourceResolver).toDynamicValue(ctx => ctx.container.get(GitResourceResolver));

    bind(GitRepositoryProvider).toSelf().inSingletonScope();
    bind(GitQuickOpenService).toSelf().inSingletonScope();

    bind(LabelProviderContribution).to(GitUriLabelProviderContribution).inSingletonScope();
});
