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

import { PreferenceService } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { Prioritizeable } from '@theia/core/lib/common/prioritizeable';
import { LanguageModel, LanguageModelResponse, UserRequest } from '../common';
import { LanguageModelServiceImpl } from '../common/language-model-service';
import { PREFERENCE_NAME_REQUEST_SETTINGS, RequestSetting, getRequestSettingSpecificity } from './ai-core-preferences';

@injectable()
export class FrontendLanguageModelServiceImpl extends LanguageModelServiceImpl {

    @inject(PreferenceService)
    protected preferenceService: PreferenceService;

    override async sendRequest(
        languageModel: LanguageModel,
        languageModelRequest: UserRequest
    ): Promise<LanguageModelResponse> {
        const requestSettings = this.preferenceService.get<RequestSetting[]>(PREFERENCE_NAME_REQUEST_SETTINGS, []);

        const ids = languageModel.id.split('/');
        const matchingSetting = mergeRequestSettings(requestSettings, ids[1], ids[0], languageModelRequest.agentId);
        if (matchingSetting?.requestSettings) {
            // Merge the settings, with user request taking precedence
            languageModelRequest.settings = {
                ...matchingSetting.requestSettings,
                ...languageModelRequest.settings
            };
        }
        if (matchingSetting?.clientSettings) {
            // Merge the clientSettings, with user request taking precedence
            languageModelRequest.clientSettings = {
                ...matchingSetting.clientSettings,
                ...languageModelRequest.clientSettings
            };
        }

        return super.sendRequest(languageModel, languageModelRequest);
    }
}

export const mergeRequestSettings = (requestSettings: RequestSetting[], modelId: string, providerId: string, agentId?: string): RequestSetting => {
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
