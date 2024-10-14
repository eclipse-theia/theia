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

    private _knownLlamaFiles: Map<string, LlamafileEntry> = new Map();

    onStart(): void {
        this.preferenceService.ready.then(() => {
            const llamafiles = this.preferenceService.get<LlamafileEntry[]>(PREFERENCE_LLAMAFILE, []);
            this.llamafileManager.addLanguageModels(llamafiles);
            llamafiles.forEach(model => this._knownLlamaFiles.set(model.name, model));

            this.preferenceService.onPreferenceChanged(event => {
                if (event.preferenceName === PREFERENCE_LLAMAFILE) {
                    // only new models which are actual LLamaFileEntries
                    const newModels = event.newValue.filter((llamafileEntry: unknown) => LlamafileEntry.is(llamafileEntry)) as LlamafileEntry[];

                    const llamafilesToAdd = newModels.filter(llamafile =>
                        !this._knownLlamaFiles.has(llamafile.name) || !LlamafileEntry.equals(this._knownLlamaFiles.get(llamafile.name)!, llamafile));

                    const llamafileIdsToRemove = [...this._knownLlamaFiles.values()].filter(llamafile =>
                        !newModels.find(a => LlamafileEntry.equals(a, llamafile))).map(a => a.name);

                    this.llamafileManager.removeLanguageModels(llamafileIdsToRemove);
                    llamafileIdsToRemove.forEach(model => this._knownLlamaFiles.delete(model));

                    this.llamafileManager.addLanguageModels(llamafilesToAdd);
                    llamafilesToAdd.forEach(model => this._knownLlamaFiles.set(model.name, model));
                }
            });
        });
    }
}
