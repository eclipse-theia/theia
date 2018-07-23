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

import { ContainerModule } from "inversify";
import { CommandContribution } from '@theia/core/lib/common';
import { KeybindingContribution, KeybindingContext } from '@theia/core/lib/browser';
import { CppCommandContribution } from './cpp-commands';

import { LanguageClientContribution } from "@theia/languages/lib/browser";
import { CppLanguageClientContribution } from "./cpp-language-client-contribution";
import { CppKeybindingContribution, CppKeybindingContext } from "./cpp-keybinding";
import { bindCppPreferences } from "./cpp-preferences";
import { CppBuildConfigurationsContributions, CppBuildConfigurationChanger, CppBuildConfigurationManager } from "./cpp-build-configurations";
import { LanguageGrammarDefinitionContribution } from "@theia/monaco/lib/browser/textmate";
import { CppGrammarContribution } from "./cpp-grammar-contribution";
import { CppBuildConfigurationsStatusBarElement } from "./cpp-build-configurations-statusbar-element";

export default new ContainerModule(bind => {
    bind(CommandContribution).to(CppCommandContribution).inSingletonScope();
    bind(CppKeybindingContext).toSelf().inSingletonScope();
    bind(KeybindingContext).toDynamicValue(context => context.container.get(CppKeybindingContext));
    bind(KeybindingContribution).to(CppKeybindingContribution).inSingletonScope();

    bind(CppLanguageClientContribution).toSelf().inSingletonScope();
    bind(LanguageClientContribution).toDynamicValue(ctx => ctx.container.get(CppLanguageClientContribution));

    bind(CppBuildConfigurationManager).toSelf().inSingletonScope();
    bind(CppBuildConfigurationChanger).toSelf().inSingletonScope();
    bind(CppBuildConfigurationsContributions).toSelf().inSingletonScope();
    bind(CommandContribution).to(CppBuildConfigurationsContributions).inSingletonScope();

    bind(LanguageGrammarDefinitionContribution).to(CppGrammarContribution).inSingletonScope();

    bind(CppBuildConfigurationsStatusBarElement).toSelf().inSingletonScope();

    bindCppPreferences(bind);
});
