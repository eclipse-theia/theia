/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { bindExtensionProvider } from '../common/extension-provider';
import { BackendApplication, ExpressContribution } from "./application";
import { ContainerModule } from "inversify";

export const applicationModule = new ContainerModule((bind) => {
    bind(BackendApplication).toSelf().inSingletonScope();
    bindExtensionProvider(bind, ExpressContribution);
});
