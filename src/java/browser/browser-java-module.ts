/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from "inversify";
import { ResourceResolver } from '../../application/common';
import { JavaClientContribution } from "./java-client-contribution";
import { LanguageClientContribution } from "../../languages/browser";

export const browserJavaModule = new ContainerModule(bind => {
    bind(JavaClientContribution).toSelf().inSingletonScope();
    bind(ResourceResolver).toDynamicValue(ctx => ctx.container.get(JavaClientContribution));
    bind(LanguageClientContribution).toDynamicValue(ctx => ctx.container.get(JavaClientContribution));
});
