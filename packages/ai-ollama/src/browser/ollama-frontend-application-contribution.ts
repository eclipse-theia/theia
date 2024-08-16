// *****************************************************************************
// Copyright (C) 2024 TypeFox GmbH.
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
import { OllamaLanguageModelsManager } from '../common';
import { HOST_PREF, MODELS_PREF } from './ollama-preferences';

@injectable()
export class OllamaFrontendApplicationContribution implements FrontendApplicationContribution {

    @inject(PreferenceService)
    protected preferenceService: PreferenceService;

    @inject(OllamaLanguageModelsManager)
    protected manager: OllamaLanguageModelsManager;

    protected prevModels: string[] = [];

    onStart(): void {
        this.preferenceService.ready.then(() => {
            const host = this.preferenceService.get<string>(HOST_PREF, 'http://localhost:11434');
            this.manager.setHost(host);

            const models = this.preferenceService.get<string[]>(MODELS_PREF, []);
            this.manager.createLanguageModels(...models);
            this.prevModels = [...models];

            this.preferenceService.onPreferenceChanged(event => {
                if (event.preferenceName === HOST_PREF) {
                    this.manager.setHost(event.newValue);
                } else if (event.preferenceName === MODELS_PREF) {
                    const oldModels = new Set(this.prevModels);
                    const newModels = new Set(event.newValue as string[]);

                    const modelsToRemove = [...oldModels].filter(model => !newModels.has(model));
                    const modelsToAdd = [...newModels].filter(model => !oldModels.has(model));

                    this.manager.removeLanguageModels(...modelsToRemove);
                    this.manager.createLanguageModels(...modelsToAdd);
                    this.prevModels = [...event.newValue];
                }
            });
        });
    }
}
