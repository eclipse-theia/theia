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

    onStart(): void {
        this.preferenceService.ready.then(() => {
            const llamafiles = this.preferenceService.get<LlamafileEntry[]>(PREFERENCE_LLAMAFILE, []);

            this.llamafileManager.addLanguageModels(llamafiles);

            this.preferenceService.onPreferenceChanged(event => {
                if (event.preferenceName === PREFERENCE_LLAMAFILE) {
                    // old models in the preference
                    const oldModels = new Set(((event.oldValue ?? []) as LlamafileEntry[]).map(v => v.name));
                    // new models in the preference as map to if a model was added and be able to create the llm and register it
                    const newModels = (event.newValue as LlamafileEntry[]).reduce((acc, v) => { acc.set(v.name, v); return acc; }, new Map<string, LlamafileEntry>());

                    const modelsToRemove = [...oldModels.values()].filter(model => !newModels.has(model));
                    this.llamafileManager.removeLanguageModels(modelsToRemove);

                    const modelDescriptionsToAdd = [...newModels.values()].filter(model => !oldModels.has(model.name));
                    this.llamafileManager.addLanguageModels(modelDescriptionsToAdd);
                }
            });
        });
    }
}
