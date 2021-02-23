/********************************************************************************
 * Copyright (c) 2021 SAP SE or an SAP affiliate company and others.
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
import { ContainerModule } from '@theia/core/shared/inversify';
import { WidgetFactory } from '@theia/core/lib/browser/widget-manager';
import { BulkEditTreeWidget, BULK_EDIT_TREE_WIDGET_ID, createBulkEditTreeWidget, InMemoryTextResourceResolver } from './bulk-edit-tree';
import { FrontendApplicationContribution, LabelProviderContribution } from '@theia/core/lib/browser';
import { bindViewContribution } from '@theia/core/lib/browser';
import { BulkEditContribution } from './bulk-edit-contribution';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { BulkEditTreeLabelProvider } from './bulk-edit-tree-label-provider';
import { ResourceResolver } from '@theia/core/lib/common';
import '../../src/browser/style/bulk-edit.css';

export default new ContainerModule(bind => {
    bind(BulkEditTreeWidget).toDynamicValue(ctx =>
        createBulkEditTreeWidget(ctx.container)
    );
    bind(WidgetFactory).toDynamicValue(context => ({
        id: BULK_EDIT_TREE_WIDGET_ID,
        createWidget: () => context.container.get(BulkEditTreeWidget)
    }));
    bindViewContribution(bind, BulkEditContribution);
    bind(FrontendApplicationContribution).toService(BulkEditContribution);
    bind(TabBarToolbarContribution).toService(BulkEditContribution);

    bind(BulkEditTreeLabelProvider).toSelf().inSingletonScope();
    bind(LabelProviderContribution).toService(BulkEditTreeLabelProvider);

    bind(InMemoryTextResourceResolver).toSelf().inSingletonScope();
    bind(ResourceResolver).toService(InMemoryTextResourceResolver);
});
