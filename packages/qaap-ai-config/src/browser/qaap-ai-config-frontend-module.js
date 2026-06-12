"use strict";
// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
Object.defineProperty(exports, "__esModule", { value: true });
require("../../src/browser/style/qaap-ai-model-options.css");
var inversify_1 = require("@theia/core/shared/inversify");
var browser_1 = require("@theia/core/lib/browser");
var preference_schema_1 = require("@theia/core/lib/common/preferences/preference-schema");
var qaap_coder_prompt_contribution_1 = require("./qaap-coder-prompt-contribution");
var qaap_tasks_background_prompt_contribution_1 = require("./qaap-tasks-background-prompt-contribution");
var qaap_ai_model_defaults_contribution_1 = require("./qaap-ai-model-defaults-contribution");
var language_model_option_contribution_1 = require("@theia/ai-ide/lib/browser/ai-configuration/language-model-option-contribution");
var qaap_language_model_option_contribution_1 = require("./qaap-language-model-option-contribution");
var qaap_incremental_stream_parsing_contribution_1 = require("./qaap-incremental-stream-parsing-contribution");
exports.default = new inversify_1.ContainerModule(function (bind) {
    bind(qaap_coder_prompt_contribution_1.QaapCoderPromptContribution).toSelf().inSingletonScope();
    bind(browser_1.FrontendApplicationContribution).toService(qaap_coder_prompt_contribution_1.QaapCoderPromptContribution);
    bind(qaap_tasks_background_prompt_contribution_1.QaapTasksBackgroundPromptContribution).toSelf().inSingletonScope();
    bind(browser_1.FrontendApplicationContribution).toService(qaap_tasks_background_prompt_contribution_1.QaapTasksBackgroundPromptContribution);
    bind(qaap_ai_model_defaults_contribution_1.QaapAiModelDefaultsContribution).toSelf().inSingletonScope();
    bind(preference_schema_1.PreferenceContribution).toService(qaap_ai_model_defaults_contribution_1.QaapAiModelDefaultsContribution);
    bind(qaap_language_model_option_contribution_1.QaapLanguageModelOptionContribution).toSelf().inSingletonScope();
    bind(language_model_option_contribution_1.LanguageModelOptionContribution).toService(qaap_language_model_option_contribution_1.QaapLanguageModelOptionContribution);
    bind(qaap_incremental_stream_parsing_contribution_1.QaapIncrementalStreamParsingContribution).toSelf().inSingletonScope();
    bind(browser_1.FrontendApplicationContribution).toService(qaap_incremental_stream_parsing_contribution_1.QaapIncrementalStreamParsingContribution);
});
