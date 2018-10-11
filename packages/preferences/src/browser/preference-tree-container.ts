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

import { interfaces } from 'inversify';
import { PreferencesDecorator } from './preferences-decorator';
import { PreferencesDecoratorService } from './preferences-decorator-service';
import {
    createTreeContainer,
    defaultTreeProps,
    TreeDecoratorService,
    TreeProps,
    TreeWidget
} from '@theia/core/lib/browser';
import { PreferencesTreeWidget } from './preferences-tree-widget';

export function createPreferencesTreeWidget(parent: interfaces.Container): PreferencesTreeWidget {
    const child = createTreeContainer(parent);

    child.bind(PreferencesTreeWidget).toSelf();
    child.rebind(TreeProps).toConstantValue({ ...defaultTreeProps, search: true });
    child.rebind(TreeWidget).toService(PreferencesTreeWidget);

    bindPreferencesDecorator(child);

    return child.get(PreferencesTreeWidget);
}

function bindPreferencesDecorator(parent: interfaces.Container): void {
    parent.bind(PreferencesDecorator).toSelf().inSingletonScope();
    parent.bind(PreferencesDecoratorService).toSelf().inSingletonScope();
    parent.rebind(TreeDecoratorService).toService(PreferencesDecoratorService);
}
