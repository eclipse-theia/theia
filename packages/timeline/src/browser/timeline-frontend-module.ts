/********************************************************************************
 * Copyright (C) 2020 RedHat and others.
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

import { Container, ContainerModule, interfaces } from '@theia/core/shared/inversify';
import { WidgetFactory } from '@theia/core/lib/browser/widget-manager';
import { TimelineService } from './timeline-service';
import { TimelineWidget } from './timeline-widget';
import { TimelineTreeWidget } from './timeline-tree-widget';
import {
    createTreeContainer,
    TreeModel,
    TreeModelImpl,
    TreeWidget
} from '@theia/core/lib/browser';
import { TimelineTreeModel } from './timeline-tree-model';
import { TimelineEmptyWidget } from './timeline-empty-widget';
import { TimelineContextKeyService } from './timeline-context-key-service';
import { TimelineContribution } from './timeline-contribution';

import '../../src/browser/style/index.css';
import { CommandContribution } from '@theia/core/lib/common';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';

export default new ContainerModule(bind => {
    bind(TimelineContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(TimelineContribution);
    bind(TabBarToolbarContribution).toService(TimelineContribution);

    bind(TimelineContextKeyService).toSelf().inSingletonScope();
    bind(TimelineService).toSelf().inSingletonScope();

    bind(TimelineWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: TimelineWidget.ID,
        createWidget: () => container.get(TimelineWidget)
    })).inSingletonScope();
    bind(TimelineTreeWidget).toDynamicValue(ctx => {
        const child = createTimelineTreeContainer(ctx.container);
        return child.get(TimelineTreeWidget);
    });
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: TimelineTreeWidget.ID,
        createWidget: () => container.get(TimelineTreeWidget)
    })).inSingletonScope();
    bind(TimelineEmptyWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: TimelineEmptyWidget.ID,
        createWidget: () => container.get(TimelineEmptyWidget)
    })).inSingletonScope();
});

export function createTimelineTreeContainer(parent: interfaces.Container): Container {
    const child = createTreeContainer(parent, {
        virtualized: true,
        search: true
    });

    child.unbind(TreeWidget);
    child.bind(TimelineTreeWidget).toSelf();

    child.unbind(TreeModelImpl);
    child.bind(TimelineTreeModel).toSelf();
    child.rebind(TreeModel).toService(TimelineTreeModel);
    return child;
}
