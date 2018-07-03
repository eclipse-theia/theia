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

import { ContainerModule } from "inversify";
import { BatContribution } from "./bat";
import { CssContribution } from "./css";
import { HtmlContribution } from "./html";
import { LessContribution } from "./less";
import { MarkdownContribution } from "./markdown";
import { ShellContribution } from "./shell";
import { XmlContribution } from "./xml";
import { XslContribution } from "./xsl";
import { YamlContribution } from "./yaml";
import { LanguageGrammarDefinitionContribution } from "@theia/monaco/lib/browser/textmate/textmate-contribution";

export default new ContainerModule(bind => {
    bind(BatContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(BatContribution);

    bind(CssContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(CssContribution);

    bind(HtmlContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(HtmlContribution);

    bind(LessContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(LessContribution);

    bind(MarkdownContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(MarkdownContribution);

    bind(ShellContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(ShellContribution);

    bind(XmlContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(XmlContribution);

    bind(XslContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(XslContribution);

    bind(YamlContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(YamlContribution);
});
