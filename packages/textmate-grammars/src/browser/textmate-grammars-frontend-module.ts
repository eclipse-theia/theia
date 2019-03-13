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

import { ContainerModule } from 'inversify';
import { BatContribution } from './bat';
import { ClojureContribution } from './clojure';
import { CoffeescriptContribution } from './coffeescript';
import { CSharpContribution } from './csharp';
import { CssContribution } from './css';
import { FSharpContribution } from './fsharp';
import { GroovyContribution } from './groovy';
import { HandlebarsContribution } from './handlebars';
import { HlslContribution } from './hlsl';
import { IniContribution } from './ini';
import { LogContribution } from './log';
import { LuaContribution } from './lua';
import { MakeContribution } from './make';
import { ObjectiveCContribution } from './objective-c';
import { PerlContribution } from './perl';
import { PowershellContribution } from './powershell';
import { PugContribution } from './pug';
import { RContribution } from './r';
import { RazorContribution } from './razor';
import { ShaderlabContribution } from './shaderlab';
import { SqlContribution } from './sql';
import { SwiftContribution } from './swift';
import { VbContribution } from './vb';
import { HtmlContribution } from './html';
import { LessContribution } from './less';
import { ScssContribution } from './scss';
import { MarkdownContribution } from './markdown';
import { ShellContribution } from './shell';
import { TclContribution } from './tcl';
import { XmlContribution } from './xml';
import { XslContribution } from './xsl';
import { JavaContribution } from './java';
import { LanguageGrammarDefinitionContribution } from '@theia/monaco/lib/browser/textmate/textmate-contribution';
import { TypescriptContribution } from './ts';
import { JavascriptContribution } from './js';
import { JsxTagsContribution } from './jsx-tags';
import { PythonContribution } from './python';
import { GoContribution } from './go';

export default new ContainerModule(bind => {
    bind(BatContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(BatContribution);

    bind(ClojureContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(ClojureContribution);

    bind(CoffeescriptContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(CoffeescriptContribution);

    bind(CSharpContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(CSharpContribution);

    bind(CssContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(CssContribution);

    bind(FSharpContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(FSharpContribution);

    bind(GroovyContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(GroovyContribution);

    bind(HandlebarsContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(HandlebarsContribution);

    bind(HlslContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(HlslContribution);

    bind(IniContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(IniContribution);

    bind(LogContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(LogContribution);

    bind(LuaContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(LuaContribution);

    bind(MakeContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(MakeContribution);

    bind(ObjectiveCContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(ObjectiveCContribution);

    bind(PerlContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(PerlContribution);

    bind(PowershellContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(PowershellContribution);

    bind(PugContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(PugContribution);

    bind(RContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(RContribution);

    bind(RazorContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(RazorContribution);

    bind(ShaderlabContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(ShaderlabContribution);

    bind(SqlContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(SqlContribution);

    bind(SwiftContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(SwiftContribution);

    bind(VbContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(VbContribution);

    bind(HtmlContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(HtmlContribution);

    bind(LessContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(LessContribution);

    bind(ScssContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(ScssContribution);

    bind(MarkdownContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(MarkdownContribution);

    bind(ShellContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(ShellContribution);

    bind(TclContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(TclContribution);

    bind(XmlContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(XmlContribution);

    bind(XslContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(XslContribution);

    bind(JavaContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(JavaContribution);

    bind(TypescriptContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(TypescriptContribution);

    bind(JavascriptContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(JavascriptContribution);

    bind(JsxTagsContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(JsxTagsContribution);

    bind(PythonContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(PythonContribution);

    bind(GoContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(GoContribution);
});
