/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from "inversify";
import { ResourceResolver, CommandContribution } from '../../application/common';
import { JavaClientContribution } from "./java-client-contribution";
import { LanguageClientContribution } from "../../languages/browser";
import { JavaCommandContribution } from './java-commands';
import { JavaResourceResolver } from './java-resource';

import "./monaco-contribution";

export default new ContainerModule(bind => {
    bind(CommandContribution).to(JavaCommandContribution).inSingletonScope();

    bind(JavaClientContribution).toSelf().inSingletonScope();
    bind(LanguageClientContribution).toDynamicValue(ctx => ctx.container.get(JavaClientContribution));

    bind(JavaResourceResolver).toSelf().inSingletonScope();
    bind(ResourceResolver).toDynamicValue(ctx => ctx.container.get(JavaResourceResolver));
});
