// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { PreferenceService } from '@theia/core/lib/common';
import { inject, injectable } from '@theia/core/shared/inversify';
import { Prioritizeable } from '@theia/core/lib/common/prioritizeable';
import { LanguageModel, LanguageModelResponse, UserRequest } from '../common';
import { LanguageModelServiceImpl } from '../common/language-model-service';
import { PREFERENCE_NAME_REQUEST_SETTINGS, RequestSetting, getRequestSettingSpecificity } from '../common/ai-core-preferences';

@injectable()
export class FrontendLanguageModelServiceImpl extends LanguageModelServiceImpl {

    @inject(PreferenceService)
    protected preferenceService: PreferenceService;

    override async sendRequest(
        languageModel: LanguageModel,
        languageModelRequest: UserRequest
    ): Promise<LanguageModelResponse> {
        applyRequestSettings(languageModelRequest, languageModel.id, languageModelRequest.agentId, this.preferenceService);
        return super.sendRequest(languageModel, languageModelRequest);
    }
}

const mergeRequestSettings = (requestSettings: RequestSetting[], modelId: string, providerId: string, agentId?: string): RequestSetting => {
    const prioritizedSettings = Prioritizeable.prioritizeAllSync(requestSettings,
        setting => getRequestSettingSpecificity(setting, {
            modelId,
            providerId,
            agentId
        }));
    // merge all settings from lowest to highest, identical priorities will be overwritten by the following
    const matchingSetting = prioritizedSettings.reduceRight((acc, cur) => ({ ...acc, ...cur.value }), {} as RequestSetting);
    return matchingSetting;
};

/**
 * Apply request settings from preferences to a user request.
 * Merges settings based on model ID, provider ID, and agent ID specificity.
 */
export const applyRequestSettings = (
    request: UserRequest,
    languageModelId: string,
    agentId: string | undefined,
    preferenceService: PreferenceService
): void => {
    const requestSettings = preferenceService.get<RequestSetting[]>(PREFERENCE_NAME_REQUEST_SETTINGS, []);
    const ids = languageModelId.split('/');
    const matchingSetting = mergeRequestSettings(requestSettings, ids[1], ids[0], agentId);

    if (matchingSetting?.requestSettings) {
        request.settings = {
            ...matchingSetting.requestSettings,
            ...request.settings
        };
    }
    if (matchingSetting?.clientSettings) {
        request.clientSettings = {
            ...matchingSetting.clientSettings,
            ...request.clientSettings
        };
    }
};
