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

import { GitHistoryContribution, GIT_HISTORY_ID } from './git-history-contribution';
import { interfaces, Container } from 'inversify';
import { WidgetFactory, OpenHandler, bindViewContribution } from '@theia/core/lib/browser';
import { GitHistoryWidget } from './git-history-widget';
import { GIT_COMMIT_DETAIL, GitCommitDetailWidget, GitCommitDetails, GitCommitDetailWidgetOptions } from './git-commit-detail-widget';

import '../../../src/browser/style/history.css';
import '../../../src/browser/style/git-icons.css';
import { GitCommitDetailOpenHandler } from './git-commit-detail-open-handler';

export function bindGitHistoryModule(bind: interfaces.Bind): void {

    bind(GitHistoryWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: GIT_HISTORY_ID,
        createWidget: () => ctx.container.get<GitHistoryWidget>(GitHistoryWidget)
    }));

    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: GIT_COMMIT_DETAIL,
        createWidget: (options: GitCommitDetails) => {
            const child = new Container({ defaultScope: 'Singleton' });
            child.parent = ctx.container;
            child.bind(GitCommitDetailWidget).toSelf();
            child.bind(GitCommitDetailWidgetOptions).toConstantValue(options);
            return child.get(GitCommitDetailWidget);
        }
    }));

    bind(GitCommitDetailOpenHandler).toSelf();
    bind(OpenHandler).toService(GitCommitDetailOpenHandler);

    bindViewContribution(bind, GitHistoryContribution);

}
