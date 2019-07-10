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
import { bindViewContribution, FrontendApplicationContribution, WidgetFactory, ViewContainer } from '@theia/core/lib/browser';
import { ScmService } from './scm-service';
import { SCM_WIDGET_FACTORY_ID, ScmContribution } from './scm-contribution';

import { ScmWidget } from './scm-widget';
import '../../src/browser/style/index.css';
import { ScmQuickOpenService } from './scm-quick-open-service';
import { bindDirtyDiff } from './dirty-diff/dirty-diff-module';
import { NavigatorTreeDecorator } from '@theia/navigator/lib/browser';
import { ScmNavigatorDecorator } from './decorations/scm-navigator-decorator';
import { ScmDecorationsService } from './decorations/scm-decorations-service';
import { ScmAvatarService } from './scm-avatar-service';
import { ScmContextKeyService } from './scm-context-key-service';

export default new ContainerModule(bind => {
    bind(ScmContextKeyService).toSelf().inSingletonScope();
    bind(ScmService).toSelf().inSingletonScope();

    bind(ScmWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: SCM_WIDGET_FACTORY_ID,
        createWidget: () => {
            const container = ctx.container.get<ViewContainer.Factory>(ViewContainer.Factory)({
                id: 'scm-view-container',
                title: {
                    label: 'Source Control',
                    iconClass: 'scm-tab-icon',
                    closeable: true
                }
            });
            container.addWidget(ctx.container.get(ScmWidget), {
                canHide: false,
                initiallyCollapsed: false
            });
            return container;
        }
    })).inSingletonScope();

    bind(ScmQuickOpenService).toSelf().inSingletonScope();
    bindViewContribution(bind, ScmContribution);
    bind(FrontendApplicationContribution).toService(ScmContribution);

    bind(NavigatorTreeDecorator).to(ScmNavigatorDecorator).inSingletonScope();
    bind(ScmDecorationsService).toSelf().inSingletonScope();

    bind(ScmAvatarService).toSelf().inSingletonScope();

    bindDirtyDiff(bind);
});
