/********************************************************************************
 * Copyright (C) 2019 Arm and others.
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

import { interfaces } from '@theia/core/shared/inversify';
import { ScmHistoryContribution, SCM_HISTORY_ID } from './scm-history-contribution';
import { WidgetFactory, bindViewContribution, ApplicationShellLayoutMigration } from '@theia/core/lib/browser';
import { ScmHistoryWidget } from './scm-history-widget';
import { ScmExtraLayoutVersion4Migration } from '../scm-extra-layout-migrations';

import '../../../src/browser/style/history.css';

export function bindScmHistoryModule(bind: interfaces.Bind): void {

    bind(ScmHistoryWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: SCM_HISTORY_ID,
        createWidget: () => ctx.container.get<ScmHistoryWidget>(ScmHistoryWidget)
    }));

    bindViewContribution(bind, ScmHistoryContribution);

    bind(ApplicationShellLayoutMigration).to(ScmExtraLayoutVersion4Migration).inSingletonScope();
}
