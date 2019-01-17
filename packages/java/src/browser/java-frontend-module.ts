/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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
import { ResourceResolver, CommandContribution, MenuContribution } from '@theia/core/lib/common';
import { KeybindingContribution, KeybindingContext } from '@theia/core/lib/browser';
import { LanguageClientContribution } from '@theia/languages/lib/browser';
import { LabelProviderContribution } from '@theia/core/lib/browser/label-provider';

import { JavaClientContribution } from './java-client-contribution';
import { JavaCommandContribution } from './java-commands';
import { JavaLabelProviderContribution } from './java-label-provider';
import { JavaResourceResolver } from './java-resource';
import { JavaEditorTextFocusContext } from './java-keybinding-contexts';
import { bindJavaPreferences } from './java-preferences';

export default new ContainerModule(bind => {
    bindJavaPreferences(bind);

    bind(JavaCommandContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(JavaCommandContribution);
    bind(KeybindingContribution).toService(JavaCommandContribution);
    bind(MenuContribution).toService(JavaCommandContribution);

    bind(JavaClientContribution).toSelf().inSingletonScope();
    bind(LanguageClientContribution).toService(JavaClientContribution);

    bind(KeybindingContext).to(JavaEditorTextFocusContext).inSingletonScope();

    bind(JavaResourceResolver).toSelf().inSingletonScope();
    bind(ResourceResolver).toService(JavaResourceResolver);

    bind(LabelProviderContribution).to(JavaLabelProviderContribution).inSingletonScope();
});
