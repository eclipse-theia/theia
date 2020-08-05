/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { inject, injectable } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { InMemoryResources } from '@theia/core';
import { JsonSchemaRegisterContext, JsonSchemaContribution } from '@theia/core/lib/browser/json-schema-store';
import { PreferenceSchemaProvider } from '@theia/core/lib/browser/preferences/preference-contribution';
import { PreferenceConfigurations } from '@theia/core/lib/browser/preferences/preference-configurations';
import { UserStorageUri } from '@theia/userstorage/lib/browser/user-storage-uri';

@injectable()
export class PreferencesJsonSchemaContribution implements JsonSchemaContribution {

    @inject(PreferenceSchemaProvider)
    protected readonly schemaProvider: PreferenceSchemaProvider;

    @inject(InMemoryResources)
    protected readonly inmemoryResources: InMemoryResources;

    @inject(PreferenceConfigurations)
    protected readonly preferenceConfigurations: PreferenceConfigurations;

    registerSchemas(context: JsonSchemaRegisterContext): void {
        const serializeSchema = () => JSON.stringify(this.schemaProvider.getCombinedSchema());
        const uri = new URI('vscode://schemas/settings/user');
        this.inmemoryResources.add(uri, serializeSchema());
        const baseName = this.preferenceConfigurations.getConfigName() + '.json';
        const fileMatch = [baseName, UserStorageUri.resolve(baseName).toString()];
        context.registerSchema({
            fileMatch,
            url: uri.toString()
        });
        this.schemaProvider.onDidPreferenceSchemaChanged(() =>
            this.inmemoryResources.update(uri, serializeSchema())
        );
    }

}
