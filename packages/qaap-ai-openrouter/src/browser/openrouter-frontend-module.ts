// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { PreferenceContribution } from '@theia/core';
import { OpenRouterPreferencesSchema } from './openrouter-preferences';
import { OpenRouterFrontendApplicationContribution } from './openrouter-frontend-application-contribution';

export default new ContainerModule(bind => {
    bind(PreferenceContribution).toConstantValue({ schema: OpenRouterPreferencesSchema });
    bind(OpenRouterFrontendApplicationContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(OpenRouterFrontendApplicationContribution);
});
