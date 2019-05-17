/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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
import { SCM_WIDGET_FACTORY_ID, ScmContribution } from './scm-contribution';
import { bindViewContribution, FrontendApplicationContribution, WidgetFactory } from '@theia/core/lib/browser';
import { ScmService } from './scm-service';
import { bindContributionProvider } from '@theia/core';

import { ScmWidget } from './scm-widget';
import '../../src/browser/style/index.css';
import {
    ScmTitleCommandsContribution,
    ScmTitleCommandRegistry
} from './scm-title-command-registry';
import { ScmResourceCommandContribution, ScmResourceCommandRegistry } from './scm-resource-command-registry';
import { ScmQuickOpenService } from './scm-quick-open-service';
import { ScmGroupCommandContribution, ScmGroupCommandRegistry } from './scm-group-command-registry';
import { bindDirtyDiff } from './dirty-diff/dirty-diff-module';
import { NavigatorTreeDecorator } from '@theia/navigator/lib/browser';
import { ScmNavigatorDecorator } from './decorations/scm-navigator-decorator';
import { ScmDecorationsService } from './decorations/scm-decorations-service';
import { ScmAvatarService } from './scm-avatar-service';

export default new ContainerModule(bind => {
    bind(ScmService).toSelf().inSingletonScope();

    bind(ScmWidget).toSelf().inSingletonScope();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: SCM_WIDGET_FACTORY_ID,
        createWidget: () => ctx.container.get(ScmWidget)
    })).inSingletonScope();

    bind(ScmQuickOpenService).toSelf().inSingletonScope();
    bindViewContribution(bind, ScmContribution);
    bind(FrontendApplicationContribution).toService(ScmContribution);

    bind(ScmTitleCommandRegistry).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ScmTitleCommandRegistry);

    bindContributionProvider(bind, ScmTitleCommandsContribution);

    bind(ScmResourceCommandRegistry).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ScmResourceCommandRegistry);

    bindContributionProvider(bind, ScmResourceCommandContribution);

    bind(ScmGroupCommandRegistry).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ScmGroupCommandRegistry);

    bindContributionProvider(bind, ScmGroupCommandContribution);

    bind(NavigatorTreeDecorator).to(ScmNavigatorDecorator).inSingletonScope();
    bind(ScmDecorationsService).toSelf().inSingletonScope();

    bind(ScmAvatarService).toSelf().inSingletonScope();

    bindDirtyDiff(bind);
});
