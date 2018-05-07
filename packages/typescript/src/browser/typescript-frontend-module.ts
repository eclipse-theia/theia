/*
 * Copyright (C) 2018 TypeFox, Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from "inversify";
import { LanguageGrammarDefinitionContribution } from "@theia/monaco/lib/browser/textmate";
import { LanguageClientContribution } from "@theia/languages/lib/browser";
import { CallHierarchyService } from "@theia/callhierarchy/lib/browser";
import { TypeScriptClientContribution, JavaScriptClientContribution } from "./typescript-client-contribution";
import { TypeScriptCallHierarchyService } from "./typescript-callhierarchy-service";
import { MonacoTextmateBuiltinGrammarContribution } from "./typescript-textmate-grammar-contribution";
import { registerTypeScript, registerJavaScript } from "./typescript-language-config";

export default new ContainerModule(bind => {
    bind(TypeScriptClientContribution).toSelf().inSingletonScope();
    bind(LanguageClientContribution).toService(TypeScriptClientContribution);

    bind(JavaScriptClientContribution).toSelf().inSingletonScope();
    bind(LanguageClientContribution).toService(JavaScriptClientContribution);

    bind(TypeScriptCallHierarchyService).toSelf().inSingletonScope();
    bind(CallHierarchyService).toService(TypeScriptCallHierarchyService);

    bind(LanguageGrammarDefinitionContribution).to(MonacoTextmateBuiltinGrammarContribution).inSingletonScope();

    registerJavaScript();
    registerTypeScript();
});
