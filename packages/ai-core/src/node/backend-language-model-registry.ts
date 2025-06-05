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

import { injectable } from '@theia/core/shared/inversify';
import { DefaultLanguageModelRegistryImpl, LanguageModel, LanguageModelMetaData, LanguageModelRegistryClient } from '../common';

/**
 * Notifies a client whenever a model is added or removed
 */
@injectable()
export class BackendLanguageModelRegistry extends DefaultLanguageModelRegistryImpl {

    private client: LanguageModelRegistryClient | undefined;

    setClient(client: LanguageModelRegistryClient): void {
        this.client = client;
    }

    override addLanguageModels(models: LanguageModel[]): void {
        const modelsLength = this.languageModels.length;
        super.addLanguageModels(models);
        // only notify for models which were really added
        for (let i = modelsLength; i < this.languageModels.length; i++) {
            this.client?.languageModelAdded(this.mapToMetaData(this.languageModels[i]));
        }
    }

    override removeLanguageModels(ids: string[]): void {
        super.removeLanguageModels(ids);
        for (const id of ids) {
            this.client?.languageModelRemoved(id);
        }
    }

    mapToMetaData(model: LanguageModel): LanguageModelMetaData {
        return {
            id: model.id,
            name: model.name,
            status: model.status,
            vendor: model.vendor,
            version: model.version,
            family: model.family,
            maxInputTokens: model.maxInputTokens,
            maxOutputTokens: model.maxOutputTokens,
        };
    }
}
