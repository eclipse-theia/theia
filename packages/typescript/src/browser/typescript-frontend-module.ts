/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from "inversify";
import { LanguageClientContribution } from "@theia/languages/lib/browser";
import { TypeScriptClientContribution, JavaScriptClientContribution } from "./typescript-client-contribution";
import { registerTypeScript, registerJavaScript } from './typescript-language-config';
import { TypeScriptCallHierarchyService } from "./typescript-callhierarchy-service";
import { CallHierarchyService } from "@theia/callhierarchy/lib/browser";

export default new ContainerModule(bind => {
    registerTypeScript();
    registerJavaScript();

    bind(TypeScriptClientContribution).toSelf().inSingletonScope();
    bind(LanguageClientContribution).toDynamicValue(ctx => ctx.container.get(TypeScriptClientContribution));

    bind(JavaScriptClientContribution).toSelf().inSingletonScope();
    bind(LanguageClientContribution).toDynamicValue(ctx => ctx.container.get(JavaScriptClientContribution));

    bind(TypeScriptCallHierarchyService).toSelf().inSingletonScope();
    bind(CallHierarchyService).toDynamicValue(ctx => ctx.container.get(TypeScriptCallHierarchyService)).inSingletonScope();
});
