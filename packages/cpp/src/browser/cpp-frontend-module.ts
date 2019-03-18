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
import { CommandContribution } from '@theia/core/lib/common';
import { KeybindingContribution, KeybindingContext, WebSocketConnectionProvider } from '@theia/core/lib/browser';
import { CppCommandContribution } from './cpp-commands';

import { LanguageClientContribution } from '@theia/languages/lib/browser';
import { CppLanguageClientContribution } from './cpp-language-client-contribution';
import { CppKeybindingContribution, CppKeybindingContext } from './cpp-keybinding';
import { bindCppPreferences } from './cpp-preferences';
import { CppBuildConfigurationsContributions, CppBuildConfigurationChanger } from './cpp-build-configurations-ui';
import { CppBuildConfigurationManager, CppBuildConfigurationManagerImpl } from './cpp-build-configurations';
import { LanguageGrammarDefinitionContribution } from '@theia/monaco/lib/browser/textmate';
import { CppGrammarContribution } from './cpp-grammar-contribution';
import { CppBuildConfigurationsStatusBarElement } from './cpp-build-configurations-statusbar-element';
import { CppTaskProvider } from './cpp-task-provider';
import { TaskContribution } from '@theia/task/lib/browser/task-contribution';
import { CppBuildConfigurationServer, cppBuildConfigurationServerPath } from '../common/cpp-build-configuration-protocol';

export default new ContainerModule(bind => {
    bind(CommandContribution).to(CppCommandContribution).inSingletonScope();
    bind(CppKeybindingContext).toSelf().inSingletonScope();
    bind(KeybindingContext).toService(CppKeybindingContext);
    bind(KeybindingContribution).to(CppKeybindingContribution).inSingletonScope();

    bind(CppLanguageClientContribution).toSelf().inSingletonScope();
    bind(LanguageClientContribution).toService(CppLanguageClientContribution);

    bind(CppTaskProvider).toSelf().inSingletonScope();
    bind(CppBuildConfigurationManager).to(CppBuildConfigurationManagerImpl).inSingletonScope();
    bind(CppBuildConfigurationChanger).toSelf().inSingletonScope();
    bind(CppBuildConfigurationsContributions).toSelf().inSingletonScope();

    bind(TaskContribution).toService(CppTaskProvider);
    bind(CommandContribution).toService(CppBuildConfigurationsContributions);
    bind(LanguageGrammarDefinitionContribution).to(CppGrammarContribution).inSingletonScope();

    bind(CppBuildConfigurationsStatusBarElement).toSelf().inSingletonScope();

    bind(CppBuildConfigurationServer).toDynamicValue(ctx =>
        WebSocketConnectionProvider.createProxy<CppBuildConfigurationServer>(ctx.container, cppBuildConfigurationServerPath)
    ).inSingletonScope();

    bindCppPreferences(bind);
});
