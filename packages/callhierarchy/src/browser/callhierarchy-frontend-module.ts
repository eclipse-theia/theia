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

import { CallHierarchyContribution } from './callhierarchy-contribution';
import { bindContributionProvider } from '@theia/core/lib/common';
import { CallHierarchyService, CallHierarchyServiceProvider } from './callhierarchy-service';
import { WidgetFactory, bindViewContribution } from '@theia/core/lib/browser';
import { CALLHIERARCHY_ID } from './callhierarchy';
import { createHierarchyTreeWidget } from './callhierarchy-tree';
import { CurrentEditorAccess } from './current-editor-access';

import { ContainerModule } from '@theia/core/shared/inversify';

import '../../src/browser/style/index.css';

export default new ContainerModule(bind => {
    bind(CurrentEditorAccess).toSelf().inSingletonScope();

    bindContributionProvider(bind, CallHierarchyService);
    bind(CallHierarchyServiceProvider).to(CallHierarchyServiceProvider).inSingletonScope();

    bindViewContribution(bind, CallHierarchyContribution);

    bind(WidgetFactory).toDynamicValue(context => ({
        id: CALLHIERARCHY_ID,
        createWidget: () => createHierarchyTreeWidget(context.container)
    }));
});
