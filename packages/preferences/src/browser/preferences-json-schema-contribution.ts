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
import { PreferenceScope } from '@theia/core/lib/browser';

const PREFERENCE_URI_PREFIX = 'vscode://schemas/settings/';
const USER_STORAGE_PREFIX = 'user-storage:/';

@injectable()
export class PreferencesJsonSchemaContribution implements JsonSchemaContribution {
    private serializeSchema = (scope: PreferenceScope) => JSON.stringify(this.schemaProvider.getSchema(scope));

    @inject(PreferenceSchemaProvider)
    protected readonly schemaProvider: PreferenceSchemaProvider;

    @inject(InMemoryResources)
    protected readonly inmemoryResources: InMemoryResources;

    @inject(PreferenceConfigurations)
    protected readonly preferenceConfigurations: PreferenceConfigurations;

    registerSchemas(context: JsonSchemaRegisterContext): void {
        this.registerSchema(PreferenceScope.Default, context);
        this.registerSchema(PreferenceScope.User, context);
        this.registerSchema(PreferenceScope.Workspace, context);
        this.registerSchema(PreferenceScope.Folder, context);

        this.schemaProvider.onDidPreferenceSchemaChanged(() => this.updateInMemoryResources());
    }

    private registerSchema(scope: PreferenceScope, context: JsonSchemaRegisterContext): void {
        const scopeStr = PreferenceScope[scope].toLowerCase();
        const uri = new URI(PREFERENCE_URI_PREFIX + scopeStr);

        this.inmemoryResources.add(uri, this.serializeSchema(scope));

        context.registerSchema({
            fileMatch: this.getFileMatch(scopeStr),
            url: uri.toString()
        });
    }

    private updateInMemoryResources(): void {
        this.inmemoryResources.update(new URI(PREFERENCE_URI_PREFIX + PreferenceScope[PreferenceScope.Default].toLowerCase()),
            this.serializeSchema(+PreferenceScope.Default));
        this.inmemoryResources.update(new URI(PREFERENCE_URI_PREFIX + PreferenceScope[PreferenceScope.User].toLowerCase()),
            this.serializeSchema(+PreferenceScope.User));
        this.inmemoryResources.update(new URI(PREFERENCE_URI_PREFIX + PreferenceScope[PreferenceScope.Workspace].toLowerCase()),
            this.serializeSchema(+PreferenceScope.Workspace));
        this.inmemoryResources.update(new URI(PREFERENCE_URI_PREFIX + PreferenceScope[PreferenceScope.Folder].toLowerCase()),
            this.serializeSchema(+PreferenceScope.Folder));
    }

    private getFileMatch(scope: string): string[] {
        const baseName = this.preferenceConfigurations.getConfigName() + '.json';
        return [baseName, new URI(USER_STORAGE_PREFIX + scope).resolve(baseName).toString()];
    }
}
