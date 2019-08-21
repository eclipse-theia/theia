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

import { interfaces } from 'inversify';
import { GitDiffContribution } from './git-diff-contribution';
import { WidgetFactory, bindViewContribution } from '@theia/core/lib/browser';
import { GitDiffWidget, GIT_DIFF } from './git-diff-widget';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';

import '../../../src/browser/style/diff.css';

export function bindGitDiffModule(bind: interfaces.Bind): void {

    bind(GitDiffWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: GIT_DIFF,
        createWidget: () => ctx.container.get<GitDiffWidget>(GitDiffWidget)
    }));

    bindViewContribution(bind, GitDiffContribution);
    bind(TabBarToolbarContribution).toService(GitDiffContribution);

}
