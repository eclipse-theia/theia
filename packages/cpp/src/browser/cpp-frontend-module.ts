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
import { TaskContribution } from '@theia/task/lib/browser';
import { CommandContribution } from '@theia/core/lib/common';
import { VariableContribution } from '@theia/variable-resolver/lib/browser';
import { LanguageClientContribution } from '@theia/languages/lib/browser';
import { LanguageGrammarDefinitionContribution } from '@theia/monaco/lib/browser/textmate';
import { CppBuildConfigurationsContributions, CppBuildConfigurationChanger, CppBuildConfigurationManager } from './cpp-build-configurations';
import { CppBuildConfigurationsStatusBarElement } from './cpp-build-configurations-statusbar-element';
import { CppKeybindingContribution, CppKeybindingContext } from './cpp-keybinding';
import { CppLanguageClientContribution } from './cpp-language-client-contribution';
import { CppBuildVariableContribution } from './cpp-build-variable-contribution';
import { CppBuildConfigurationManager } from './cpp-build-configurations';
import { CppGrammarContribution } from './cpp-grammar-contribution';
import { CppCommandContribution } from './cpp-commands';
import { bindCppPreferences } from './cpp-preferences';
import { bindCppPreferences } from './cpp-preferences';
import { CppBuildManager } from './cpp-build-manager';
import { CppTaskProvider } from './cpp-task-provider';

export default new ContainerModule(bind => {
    bind(CommandContribution).to(CppCommandContribution).inSingletonScope();
    bind(CppKeybindingContext).toSelf().inSingletonScope();
    bind(KeybindingContext).toService(CppKeybindingContext);
    bind(KeybindingContribution).to(CppKeybindingContribution).inSingletonScope();

    bind(CppLanguageClientContribution).toSelf().inSingletonScope();
    bind(LanguageClientContribution).toService(CppLanguageClientContribution);

    bind(CppBuildManager).toSelf().inSingletonScope();
    bind(CppTaskProvider).toSelf().inSingletonScope();
    bind(CppBuildConfigurationManager).toSelf().inSingletonScope();
    bind(CppBuildConfigurationChanger).toSelf().inSingletonScope();
    bind(CppBuildVariableContribution).toSelf().inSingletonScope();
    bind(CppBuildConfigurationsContributions).toSelf().inSingletonScope();

    bind(TaskContribution).toService(CppTaskProvider);
    bind(VariableContribution).toService(CppBuildVariableContribution);
    bind(CommandContribution).toService(CppBuildConfigurationsContributions);
    bind(LanguageGrammarDefinitionContribution).to(CppGrammarContribution).inSingletonScope();

    bind(CppBuildConfigurationsStatusBarElement).toSelf().inSingletonScope();

    bindCppPreferences(bind);
});
