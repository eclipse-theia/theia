// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { JsonSchemaRegisterContext, JsonSchemaContribution, JsonSchemaDataStore } from '@theia/core/lib/browser/json-schema-store';
import { PreferenceSchemaProvider } from '@theia/core/lib/browser/preferences/preference-contribution';
import { PreferenceConfigurations } from '@theia/core/lib/browser/preferences/preference-configurations';
import { PreferenceScope } from '@theia/core/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';

const PREFERENCE_URI_PREFIX = 'vscode://schemas/settings/';
const USER_STORAGE_PREFIX = 'user-storage:/';

@injectable()
export class PreferencesJsonSchemaContribution implements JsonSchemaContribution {
    protected serializeSchema = (scope: PreferenceScope) => JSON.stringify(this.schemaProvider.getSchema(scope));

    @inject(PreferenceSchemaProvider)
    protected readonly schemaProvider: PreferenceSchemaProvider;

    @inject(PreferenceConfigurations)
    protected readonly preferenceConfigurations: PreferenceConfigurations;

    @inject(JsonSchemaDataStore)
    protected readonly jsonSchemaData: JsonSchemaDataStore;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    registerSchemas(context: JsonSchemaRegisterContext): void {
        this.registerSchema(PreferenceScope.Default, context);
        this.registerSchema(PreferenceScope.User, context);
        this.registerSchema(PreferenceScope.Workspace, context);
        this.registerSchema(PreferenceScope.Folder, context);

        this.workspaceService.updateSchema('settings', { $ref: this.getSchemaURIForScope(PreferenceScope.Workspace).toString() });
        this.schemaProvider.onDidPreferenceSchemaChanged(() => this.updateInMemoryResources());
    }

    protected registerSchema(scope: PreferenceScope, context: JsonSchemaRegisterContext): void {
        const scopeStr = PreferenceScope[scope].toLowerCase();
        const uri = new URI(PREFERENCE_URI_PREFIX + scopeStr);

        this.jsonSchemaData.setSchema(uri, this.serializeSchema(scope));

        context.registerSchema({
            fileMatch: this.getFileMatch(scopeStr),
            url: uri.toString()
        });
    }

    protected updateInMemoryResources(): void {
        this.jsonSchemaData.setSchema(this.getSchemaURIForScope(PreferenceScope.Default),
            this.serializeSchema(+PreferenceScope.Default));
        this.jsonSchemaData.setSchema(this.getSchemaURIForScope(PreferenceScope.User),
            this.serializeSchema(+PreferenceScope.User));
        this.jsonSchemaData.setSchema(this.getSchemaURIForScope(PreferenceScope.Workspace),
            this.serializeSchema(+PreferenceScope.Workspace));
        this.jsonSchemaData.setSchema(this.getSchemaURIForScope(PreferenceScope.Folder),
            this.serializeSchema(+PreferenceScope.Folder));
    }

    protected getSchemaURIForScope(scope: PreferenceScope): URI {
        return new URI(PREFERENCE_URI_PREFIX + PreferenceScope[scope].toLowerCase());
    }

    protected getFileMatch(scope: string): string[] {
        const baseName = this.preferenceConfigurations.getConfigName() + '.json';
        return [baseName, new URI(USER_STORAGE_PREFIX + scope).resolve(baseName).toString()];
    }
}
