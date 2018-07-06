/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { ContainerModule, interfaces } from 'inversify';
import { WidgetFactory, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { ProgressService } from './progress-service';
import { ProgressDialog } from './progress-dialog';
import { ProgressStatusBar } from './progress-status-bar';
import { ProgressWidget } from './progress-widget';

export default new ContainerModule((bind: interfaces.Bind) => {

    bind(ProgressDialog).toSelf().inSingletonScope();

    bind(ProgressStatusBar).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ProgressStatusBar);

    bind(ProgressService).toSelf().inSingletonScope();

    bind(ProgressWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: 'progress-monitor',
        createWidget: () => ctx.container.get(ProgressWidget)
    }));

});
