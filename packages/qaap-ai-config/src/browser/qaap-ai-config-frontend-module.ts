// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { PreferenceContribution } from '@theia/core/lib/common/preferences/preference-schema';
import { QaapCoderPromptContribution } from './qaap-coder-prompt-contribution';
import { QaapAiModelDefaultsContribution } from './qaap-ai-model-defaults-contribution';

export default new ContainerModule(bind => {
    bind(QaapCoderPromptContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QaapCoderPromptContribution);

    bind(QaapAiModelDefaultsContribution).toSelf().inSingletonScope();
    bind(PreferenceContribution).toService(QaapAiModelDefaultsContribution);
});
