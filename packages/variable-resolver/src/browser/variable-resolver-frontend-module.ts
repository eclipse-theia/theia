/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from 'inversify';
import { bindContributionProvider, CommandContribution } from '@theia/core';
import { FrontendApplicationContribution, VariableRegistry, VariableContribution } from '@theia/core/lib/browser';
import { VariableQuickOpenService } from './variable-quick-open-service';
import { VariableResolverFrontendContribution } from './variable-resolver-frontend-contribution';
import { VariableResolverService } from './variable-resolver-service';

export default new ContainerModule(bind => {
    bind(VariableRegistry).toSelf().inSingletonScope();
    bind(VariableResolverService).toSelf().inSingletonScope();
    bindContributionProvider(bind, VariableContribution);

    bind(VariableResolverFrontendContribution).toSelf().inSingletonScope();
    for (const identifier of [FrontendApplicationContribution, CommandContribution]) {
        bind(identifier).toService(VariableResolverFrontendContribution);
    }

    bind(VariableQuickOpenService).toSelf().inSingletonScope();
});
