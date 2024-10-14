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

@injectable()
export class LlamafileFrontendApplicationContribution implements FrontendApplicationContribution {

    @inject(PreferenceService)
    protected preferenceService: PreferenceService;

    @inject(LlamafileManager)
    protected llamafileManager: LlamafileManager;

    private _llamafilesIds: Set<string> = new Set();

    onStart(): void {
        this.preferenceService.ready.then(() => {
            const llamafiles = this.preferenceService.get<LlamafileEntry[]>(PREFERENCE_LLAMAFILE, []);
            this.llamafileManager.addLanguageModels(llamafiles);
            llamafiles.forEach(model => this._llamafilesIds.add(model.name));

            this.preferenceService.onPreferenceChanged(event => {
                if (event.preferenceName === PREFERENCE_LLAMAFILE) {
                    // new models in the preference as map to if a model was added and be able to create the llm and register it
                    const newModels = (event.newValue as LlamafileEntry[]).reduce((acc, v) => { acc.set(v.name, v); return acc; }, new Map<string, LlamafileEntry>());

                    const modelsToRemove = [...this._llamafilesIds.values()].filter(model => !newModels.has(model));
                    const modelDescriptionsToAdd = [...newModels.values()].filter(model => !this._llamafilesIds.has(model.name));
                    const validModelsToAdd = modelDescriptionsToAdd.filter(model =>
                        model.name !== undefined && model.name.length !== 0 &&
                        model.uri !== undefined && model.uri.length !== 0 &&
                        model.port !== undefined && model.port > 1023
                    );

                    this.llamafileManager.removeLanguageModels(modelsToRemove);
                    modelsToRemove.forEach(model => this._llamafilesIds.delete(model));

                    this.llamafileManager.addLanguageModels(validModelsToAdd);
                    validModelsToAdd.forEach(model => this._llamafilesIds.add(model.name));
                }
            });
        });
    }
}
