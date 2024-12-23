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
import { LlamafileManager, LlamafileModelDescription } from '../common/llamafile-manager';
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
            const validLlamafiles = llamafiles.filter(LlamafileEntry.is);

            const LlamafileModelDescriptions = this.getLLamaFileModelDescriptions(validLlamafiles);

            this.llamafileManager.addLanguageModels(LlamafileModelDescriptions);
            validLlamafiles.forEach(model => this._knownLlamaFiles.set(model.name, model));

            this.preferenceService.onPreferenceChanged(event => {
                if (event.preferenceName === PREFERENCE_LLAMAFILE) {
                    const newModels = event.newValue.filter((llamafileEntry: unknown) => LlamafileEntry.is(llamafileEntry)) as LlamafileEntry[];
                    this.handleLlamaFilePreferenceChange(newModels);
                } else if (event.preferenceName === PREFERENCE_NAME_REQUEST_SETTINGS) {
                    this.handleRequestSettingsChange(event.newValue as RequestSetting[]);
                }
            });
        });
    }

    protected getLLamaFileModelDescriptions(llamafiles: LlamafileEntry[]): LlamafileModelDescription[] {
        const requestSettings = this.preferenceService.get<RequestSetting[]>(PREFERENCE_NAME_REQUEST_SETTINGS, []);
        return llamafiles.map(llamafile => {
            const matchingSettings = requestSettings.filter(
                setting =>
                    (!setting.providerId || setting.providerId === LLAMAFILE_PROVIDER_ID) &&
                    setting.modelId === llamafile.name
            );
            if (matchingSettings.length > 1) {
                console.warn(`Multiple entries found for model "${llamafile.name}". Using the first match.`);
            }
            return {
                name: llamafile.name,
                uri: llamafile.uri,
                port: llamafile.port,
                defaultRequestSettings: matchingSettings[0]?.requestSettings
            };
        });
    }

    protected handleLlamaFilePreferenceChange(newModels: LlamafileEntry[]): void {
        const llamafilesToAdd = newModels.filter(llamafile =>
            !this._knownLlamaFiles.has(llamafile.name) ||
            !LlamafileEntry.equals(this._knownLlamaFiles.get(llamafile.name)!, llamafile));

        const llamafileIdsToRemove = [...this._knownLlamaFiles.values()].filter(llamafile =>
            !newModels.find(newModel => LlamafileEntry.equals(newModel, llamafile)))
            .map(llamafile => llamafile.name);

        this.llamafileManager.removeLanguageModels(llamafileIdsToRemove);
        llamafileIdsToRemove.forEach(id => this._knownLlamaFiles.delete(id));

        this.llamafileManager.addLanguageModels(this.getLLamaFileModelDescriptions(llamafilesToAdd));
        llamafilesToAdd.forEach(model => this._knownLlamaFiles.set(model.name, model));
    }

    protected handleRequestSettingsChange(newSettings: RequestSetting[]): void {
        const llamafiles = Array.from(this._knownLlamaFiles.values());
        const llamafileModelDescriptions = this.getLLamaFileModelDescriptions(llamafiles);
        llamafileModelDescriptions.forEach(llamafileModelDescription => {
            this.llamafileManager.updateRequestSettings(llamafileModelDescription.name, llamafileModelDescription.defaultRequestSettings);
        });
    }
}

export interface LlamafileEntry {
    name: string;
    uri: string;
    port: number;
}

namespace LlamafileEntry {
    export function equals(a: LlamafileEntry, b: LlamafileEntry): boolean {
        return (
            a.name === b.name &&
            a.uri === b.uri &&
            a.port === b.port
        );
    }

    export function is(entry: unknown): entry is LlamafileEntry {
        return (
            typeof entry === 'object' &&
            // eslint-disable-next-line no-null/no-null
            entry !== null &&
            'name' in entry && typeof (entry as LlamafileEntry).name === 'string' &&
            'uri' in entry && typeof (entry as LlamafileEntry).uri === 'string' &&
            'port' in entry && typeof (entry as LlamafileEntry).port === 'number'
        );
    }
}
