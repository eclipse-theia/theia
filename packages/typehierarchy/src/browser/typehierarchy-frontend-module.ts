/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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
import { bindViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { TypeHierarchyRegistry } from './typehierarchy-provider';
import { TypeHierarchyContribution } from './typehierarchy-contribution';
import { TypeHierarchyTreeWidget } from './tree/typehierarchy-tree-widget';
import { createHierarchyTreeWidget } from './tree/typehierarchy-tree-container';

import '../../src/browser/style/index.css';

export default new ContainerModule(bind => {
    bind(TypeHierarchyRegistry).toSelf().inSingletonScope();
    bindViewContribution(bind, TypeHierarchyContribution);
    bind(WidgetFactory).toDynamicValue(context => ({
        id: TypeHierarchyTreeWidget.WIDGET_ID,
        createWidget: () => createHierarchyTreeWidget(context.container)
    }));
});
