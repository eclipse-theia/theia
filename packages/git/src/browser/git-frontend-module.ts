/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from 'inversify';
import { ResourceResolver } from "@theia/core/lib/common";
import { WebSocketConnectionProvider, WidgetFactory, bindViewContribution, LabelProviderContribution } from '@theia/core/lib/browser';
import { NavigatorTreeDecorator } from '@theia/navigator/lib/browser';
import { Git, GitPath, GitWatcher, GitWatcherPath, GitWatcherServer, GitWatcherServerProxy, ReconnectingGitWatcherServer } from '../common';
import { GitViewContribution, GIT_WIDGET_FACTORY_ID } from './git-view-contribution';
import { bindGitDiffModule } from './diff/git-diff-frontend-module';
import { bindGitHistoryModule } from './history/git-history-frontend-module';
import { GitWidget } from './git-widget';
import { GitResourceResolver } from './git-resource';
import { GitRepositoryProvider } from './git-repository-provider';
import { GitQuickOpenService } from './git-quick-open-service';
import { GitUriLabelProviderContribution } from './git-uri-label-contribution';
import { GitDecorator } from './git-decorator';
import { bindGitPreferences } from './git-preferences';
import { bindDirtyDiff } from './dirty-diff/dirty-diff-module';
import { bindBlame } from './blame/blame-module';
import { GitRepositoryTracker } from './git-repository-tracker';
import { GitCommitMessageValidator } from './git-commit-message-validator';
import { GitSyncService } from './git-sync-service';

import '../../src/browser/style/index.css';

export default new ContainerModule(bind => {
    bindGitPreferences(bind);
    bindGitDiffModule(bind);
    bindGitHistoryModule(bind);
    bindDirtyDiff(bind);
    bindBlame(bind);
    bind(GitRepositoryTracker).toSelf().inSingletonScope();
    bind(GitWatcherServerProxy).toDynamicValue(context => WebSocketConnectionProvider.createProxy(context.container, GitWatcherPath)).inSingletonScope();
    bind(GitWatcherServer).to(ReconnectingGitWatcherServer).inSingletonScope();
    bind(GitWatcher).toSelf().inSingletonScope();
    bind(Git).toDynamicValue(context => WebSocketConnectionProvider.createProxy(context.container, GitPath)).inSingletonScope();

    bindViewContribution(bind, GitViewContribution);
    bind(GitWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(context => ({
        id: GIT_WIDGET_FACTORY_ID,
        createWidget: () => context.container.get<GitWidget>(GitWidget)
    })).inSingletonScope();

    bind(GitResourceResolver).toSelf().inSingletonScope();
    bind(ResourceResolver).toService(GitResourceResolver);

    bind(GitRepositoryProvider).toSelf().inSingletonScope();
    bind(GitQuickOpenService).toSelf().inSingletonScope();

    bind(LabelProviderContribution).to(GitUriLabelProviderContribution).inSingletonScope();
    bind(NavigatorTreeDecorator).to(GitDecorator).inSingletonScope();

    bind(GitCommitMessageValidator).toSelf().inSingletonScope();

    bind(GitSyncService).toSelf().inSingletonScope();
});
