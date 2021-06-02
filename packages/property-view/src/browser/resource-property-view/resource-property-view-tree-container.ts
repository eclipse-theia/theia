/********************************************************************************
 * Copyright (C) 2020 EclipseSource and others.
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

import { createTreeContainer, LabelProviderContribution, TreeProps, TreeWidget } from '@theia/core/lib/browser';
import { interfaces } from '@theia/core/shared/inversify';
import { PropertyDataService } from '../property-data-service';
import { PropertyViewWidgetProvider } from '../property-view-widget-provider';
import { ResourcePropertyDataService } from './resource-property-data-service';
import { ResourcePropertiesLabelProvider } from './resource-property-view-label-provider';
import { ResourcePropertyViewTreeWidget } from './resource-property-view-tree-widget';
import { ResourcePropertyViewWidgetProvider } from './resource-property-view-widget-provider';

const RESOURCE_PROPERTY_VIEW_TREE_PROPS = {
    multiSelect: true,
    search: true,
} as TreeProps;

function createResourcePropertyViewTreeWidget(parent: interfaces.Container): ResourcePropertyViewTreeWidget {
    const child = createTreeContainer(parent, RESOURCE_PROPERTY_VIEW_TREE_PROPS);
    child.unbind(TreeWidget);
    child.bind(ResourcePropertyViewTreeWidget).toSelf().inSingletonScope();
    return child.get(ResourcePropertyViewTreeWidget);
}

export function bindResourcePropertyView(bind: interfaces.Bind): void {
    bind(LabelProviderContribution).to(ResourcePropertiesLabelProvider).inSingletonScope();
    bind(PropertyDataService).to(ResourcePropertyDataService).inSingletonScope();
    bind(PropertyViewWidgetProvider).to(ResourcePropertyViewWidgetProvider).inSingletonScope();

    bind(ResourcePropertyViewTreeWidget).toDynamicValue(ctx =>
        createResourcePropertyViewTreeWidget(ctx.container)
    );
}
