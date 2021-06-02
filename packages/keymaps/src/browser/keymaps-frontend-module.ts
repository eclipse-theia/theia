/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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
import { KeymapsService } from './keymaps-service';
import { KeymapsFrontendContribution } from './keymaps-frontend-contribution';
import { CommandContribution, MenuContribution } from '@theia/core/lib/common';
import { KeybindingContribution } from '@theia/core/lib/browser/keybinding';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';

import './keymaps-monaco-contribution';
import { WidgetFactory } from '@theia/core/lib/browser';
import { KeybindingWidget } from './keybindings-widget';

import '../../src/browser/style/index.css';

export default new ContainerModule(bind => {
    bind(KeymapsService).toSelf().inSingletonScope();
    bind(KeymapsFrontendContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(KeymapsFrontendContribution);
    bind(KeybindingContribution).toService(KeymapsFrontendContribution);
    bind(MenuContribution).toService(KeymapsFrontendContribution);
    bind(KeybindingWidget).toSelf();
    bind(TabBarToolbarContribution).toService(KeymapsFrontendContribution);
    bind(WidgetFactory).toDynamicValue(context => ({
        id: KeybindingWidget.ID,
        createWidget: () => context.container.get<KeybindingWidget>(KeybindingWidget),
    })).inSingletonScope();
});
