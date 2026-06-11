// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import '../../src/browser/style/qaap-ai-model-options.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { PreferenceContribution } from '@theia/core/lib/common/preferences/preference-schema';
import { QaapCoderPromptContribution } from './qaap-coder-prompt-contribution';
import { QaapTasksBackgroundPromptContribution } from './qaap-tasks-background-prompt-contribution';
import { QaapAiModelDefaultsContribution } from './qaap-ai-model-defaults-contribution';
import { LanguageModelOptionContribution } from '@theia/ai-ide/lib/browser/ai-configuration/language-model-option-contribution';
import { QaapLanguageModelOptionContribution } from './qaap-language-model-option-contribution';
import { QaapIncrementalStreamParsingContribution } from './qaap-incremental-stream-parsing-contribution';

export default new ContainerModule(bind => {
    bind(QaapCoderPromptContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QaapCoderPromptContribution);

    bind(QaapTasksBackgroundPromptContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QaapTasksBackgroundPromptContribution);

    bind(QaapAiModelDefaultsContribution).toSelf().inSingletonScope();
    bind(PreferenceContribution).toService(QaapAiModelDefaultsContribution);

    bind(QaapLanguageModelOptionContribution).toSelf().inSingletonScope();
    bind(LanguageModelOptionContribution).toService(QaapLanguageModelOptionContribution);

    bind(QaapIncrementalStreamParsingContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QaapIncrementalStreamParsingContribution);
});
