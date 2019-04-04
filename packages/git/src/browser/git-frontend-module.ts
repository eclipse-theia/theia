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

import { ContainerModule } from 'inversify';
import { CommandContribution, MenuContribution, ResourceResolver } from '@theia/core/lib/common';
import {
    WebSocketConnectionProvider,
    LabelProviderContribution,
    FrontendApplicationContribution,
} from '@theia/core/lib/browser';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { NavigatorTreeDecorator } from '@theia/navigator/lib/browser';
import { Git, GitPath, GitWatcher, GitWatcherPath, GitWatcherServer, GitWatcherServerProxy, ReconnectingGitWatcherServer } from '../common';
import { GitContribution } from './git-contribution';
import { bindGitDiffModule } from './diff/git-diff-frontend-module';
import { bindGitHistoryModule } from './history/git-history-frontend-module';
import { GitCommands } from './git-commands';
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
import { GitErrorHandler } from './git-error-handler';

import '../../src/browser/style/index.css';
import { ScmTitleCommandsContribution } from '@theia/scm/lib/browser/scm-title-command-registry';
import { ScmResourceCommandContribution } from '@theia/scm/lib/browser/scm-resource-command-registry';
import { ScmGroupCommandContribution } from '@theia/scm/lib/browser/scm-group-command-registry';

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

    bind(GitContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(GitContribution);
    bind(MenuContribution).toService(GitContribution);
    bind(FrontendApplicationContribution).toService(GitContribution);
    bind(TabBarToolbarContribution).toService(GitContribution);
    bind(ScmTitleCommandsContribution).toService(GitContribution);
    bind(ScmResourceCommandContribution).toService(GitContribution);
    bind(ScmGroupCommandContribution).toService(GitContribution);

    bind(GitCommands).toSelf();

    bind(GitResourceResolver).toSelf().inSingletonScope();
    bind(ResourceResolver).toService(GitResourceResolver);

    bind(GitRepositoryProvider).toSelf().inSingletonScope();
    bind(GitQuickOpenService).toSelf().inSingletonScope();

    bind(LabelProviderContribution).to(GitUriLabelProviderContribution).inSingletonScope();
    bind(NavigatorTreeDecorator).to(GitDecorator).inSingletonScope();

    bind(GitCommitMessageValidator).toSelf().inSingletonScope();

    bind(GitSyncService).toSelf().inSingletonScope();
    bind(GitErrorHandler).toSelf().inSingletonScope();
});
