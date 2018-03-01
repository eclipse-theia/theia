/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from "inversify";
import { ResourceResolver, CommandContribution, MenuContribution } from '@theia/core/lib/common';
import { KeybindingContribution, KeybindingContext } from '@theia/core/lib/browser';
import { LanguageClientContribution } from "@theia/languages/lib/browser";
import { LabelProviderContribution } from "@theia/core/lib/browser/label-provider";

import { JavaClientContribution } from "./java-client-contribution";
import { JavaCommandContribution } from './java-commands';
import { JavaLabelProviderContribution } from './java-label-provider';
import { JavaResourceResolver } from './java-resource';
import { JavaEditorTextFocusContext } from "./java-keybinding-contexts";

import "./monaco-contribution";

export default new ContainerModule(bind => {
    bind(JavaCommandContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toDynamicValue(ctx => ctx.container.get(JavaCommandContribution)).inSingletonScope();
    bind(KeybindingContribution).toDynamicValue(ctx => ctx.container.get(JavaCommandContribution)).inSingletonScope();
    bind(MenuContribution).toDynamicValue(ctx => ctx.container.get(JavaCommandContribution)).inSingletonScope();

    bind(JavaClientContribution).toSelf().inSingletonScope();
    bind(LanguageClientContribution).toDynamicValue(ctx => ctx.container.get(JavaClientContribution));

    bind(KeybindingContext).to(JavaEditorTextFocusContext).inSingletonScope();

    bind(JavaResourceResolver).toSelf().inSingletonScope();
    bind(ResourceResolver).toDynamicValue(ctx => ctx.container.get(JavaResourceResolver));

    bind(LabelProviderContribution).to(JavaLabelProviderContribution).inSingletonScope();
});
