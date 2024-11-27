// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { FrontendApplicationContribution, PreferenceService } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { LlamafileEntry, LlamafileManager } from '../common/llamafile-manager';
import { PREFERENCE_LLAMAFILE } from './llamafile-preferences';
import { PREFERENCE_NAME_REQUEST_SETTINGS, RequestSetting } from '@theia/ai-core/lib/browser/ai-core-preferences';

const LLAMAFILE_PROVIDER_ID = 'llamafile';
@injectable()
export class LlamafileFrontendApplicationContribution implements FrontendApplicationContribution {

    @inject(PreferenceService)
    protected preferenceService: PreferenceService;

    @inject(LlamafileManager)
    protected llamafileManager: LlamafileManager;

    private _knownLlamaFiles: Map<string, LlamafileEntry> = new Map();

    onStart(): void {
        this.preferenceService.ready.then(() => {
            const llamafiles = this.preferenceService.get<LlamafileEntry[]>(PREFERENCE_LLAMAFILE, []);
            const requestSettings = this.preferenceService.get<RequestSetting[]>(PREFERENCE_NAME_REQUEST_SETTINGS, []);
            const modelsWithSettings = llamafiles.map(model => this.applyRequestSettingsToLlamaFile(model, requestSettings));

            this.llamafileManager.addLanguageModels(modelsWithSettings);
            modelsWithSettings.forEach(model => this._knownLlamaFiles.set(model.name, model));

            this.preferenceService.onPreferenceChanged(event => {
                if (event.preferenceName === PREFERENCE_LLAMAFILE) {
                    this.handleLlamaFilePreferenceChange(event.newValue as LlamafileEntry[]);
                } else if (event.preferenceName === PREFERENCE_NAME_REQUEST_SETTINGS) {
                    this.handleRequestSettingsChange(event.newValue as RequestSetting[]);
                }
            });
        });
    }

    protected handleLlamaFilePreferenceChange(newModels: LlamafileEntry[]): void {
        const requestSettings = this.preferenceService.get<RequestSetting[]>(PREFERENCE_NAME_REQUEST_SETTINGS, []);

        // Models to add or update
        const llamafilesToAdd = newModels.filter(llamafile =>
            !this._knownLlamaFiles.has(llamafile.name) ||
            !LlamafileEntry.equals(this._knownLlamaFiles.get(llamafile.name)!, llamafile));

        // Models to remove
        const llamafileIdsToRemove = [...this._knownLlamaFiles.values()].filter(llamafile =>
            !newModels.find(newModel => LlamafileEntry.equals(newModel, llamafile)))
            .map(llamafile => llamafile.name);

        // Update the manager
        this.llamafileManager.removeLanguageModels(llamafileIdsToRemove);
        llamafileIdsToRemove.forEach(id => this._knownLlamaFiles.delete(id));

        const modelsWithSettings = llamafilesToAdd.map(model => this.applyRequestSettingsToLlamaFile(model, requestSettings));
        this.llamafileManager.addLanguageModels(modelsWithSettings);
        modelsWithSettings.forEach(model => this._knownLlamaFiles.set(model.name, model));
    }

    protected handleRequestSettingsChange(newSettings: RequestSetting[]): void {
        const llamafiles = this.preferenceService.get<LlamafileEntry[]>(PREFERENCE_LLAMAFILE, []);
        const modelsWithSettings = llamafiles.map(model => this.applyRequestSettingsToLlamaFile(model, newSettings));

        this.llamafileManager.addLanguageModels(modelsWithSettings);
        modelsWithSettings.forEach(model => this._knownLlamaFiles.set(model.name, model));
    }

    protected applyRequestSettingsToLlamaFile(model: LlamafileEntry, requestSettings: RequestSetting[]): LlamafileEntry {
        const matchingSettings = requestSettings.filter(
            setting => (!setting.providerId || setting.providerId === LLAMAFILE_PROVIDER_ID) && setting.modelId === model.name
        );
        if (matchingSettings.length > 1) {
            console.warn(`Multiple entries found for model "${model.name}". Using the first match.`);
        }

        return {
            ...model,
            defaultRequestSettings: matchingSettings[0]?.requestSettings
        };
    }
}
