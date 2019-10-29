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

import '../../src/browser/style/index.css';

import { ContainerModule } from 'inversify';
import { CommandContribution, MenuContribution, ResourceResolver } from '@theia/core/lib/common';
import {
    WebSocketConnectionProvider,
    LabelProviderContribution,
    FrontendApplicationContribution,
} from '@theia/core/lib/browser';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { NavigatorTreeDecorator } from '@theia/navigator/lib/browser';
import { Hg, HgPath, HgWatcher, HgWatcherPath, HgWatcherServer, HgWatcherServerProxy, ReconnectingHgWatcherServer } from '../common';
import { HgContribution } from './hg-contribution';
import { bindHgDiffModule } from './diff/hg-diff-frontend-module';
import { bindHgHistoryModule } from './history/hg-history-frontend-module';
import { HgResourceResolver } from './hg-resource-resolver';
import { HgRepositoryProvider } from './hg-repository-provider';
import { HgQuickOpenService } from './hg-quick-open-service';
import { HgUriLabelProviderContribution } from './hg-uri-label-contribution';
import { HgDecorator } from './hg-decorator';
import { bindHgPreferences } from './hg-preferences';
import { bindDirtyDiff } from './dirty-diff/dirty-diff-module';
import { HgRepositoryTracker } from './hg-repository-tracker';
import { HgCommitMessageValidator } from './hg-commit-message-validator';
import { HgSyncService } from './hg-sync-service';
import { HgErrorHandler } from './hg-error-handler';
import { HgScmProvider } from './hg-scm-provider';
import { HgHistorySupport } from './history/hg-history-support';
import { ScmHistorySupport } from '@theia/scm/lib/browser/history/scm-history-widget';

export default new ContainerModule(bind => {
    bindHgPreferences(bind);
    bindHgDiffModule(bind);
    bindHgHistoryModule(bind);
    bindDirtyDiff(bind);
    bind(HgRepositoryTracker).toSelf().inSingletonScope();
    bind(HgWatcherServerProxy).toDynamicValue(context => WebSocketConnectionProvider.createProxy(context.container, HgWatcherPath)).inSingletonScope();
    bind(HgWatcherServer).to(ReconnectingHgWatcherServer).inSingletonScope();
    bind(HgWatcher).toSelf().inSingletonScope();
    bind(Hg).toDynamicValue(context => WebSocketConnectionProvider.createProxy(context.container, HgPath)).inSingletonScope();

    bind(HgContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(HgContribution);
    bind(MenuContribution).toService(HgContribution);
    bind(FrontendApplicationContribution).toService(HgContribution);
    bind(TabBarToolbarContribution).toService(HgContribution);

    bind(HgResourceResolver).toSelf().inSingletonScope();
    bind(ResourceResolver).toService(HgResourceResolver);

    bind(HgScmProvider.ContainerFactory).toFactory(HgScmProvider.createFactory);
    bind(HgRepositoryProvider).toSelf().inSingletonScope();
    bind(HgQuickOpenService).toSelf().inSingletonScope();
    bind(HgScmProvider.ScmTypeContainer).toDynamicValue(({ container }) => {
        const child = container.createChild();
        child.bind(HgScmProvider).toSelf().inTransientScope();
        child.bind(HgHistorySupport).toSelf().inTransientScope();
        child.bind(ScmHistorySupport).toService(HgHistorySupport);
        return child;
    }).inSingletonScope();

    bind(LabelProviderContribution).to(HgUriLabelProviderContribution).inSingletonScope();
    bind(NavigatorTreeDecorator).to(HgDecorator).inSingletonScope();

    bind(HgCommitMessageValidator).toSelf().inSingletonScope();

    bind(HgSyncService).toSelf().inSingletonScope();
    bind(HgErrorHandler).toSelf().inSingletonScope();
});
