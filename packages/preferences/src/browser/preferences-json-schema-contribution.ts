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
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { PreferenceSchemaService, PreferenceConfigurations, PreferenceScope } from '@theia/core';
import { UserStorageUri } from '@theia/userstorage/lib/browser';
import debounce = require('@theia/core/shared/lodash.debounce');

const PREFERENCE_URI_PREFIX = 'vscode://schemas/settings/';
const DEBOUNCED_UPDATE_DELAY = 200;

@injectable()
export class PreferencesJsonSchemaContribution implements JsonSchemaContribution {

    @inject(PreferenceSchemaService)
    protected readonly schemaProvider: PreferenceSchemaService;

    @inject(PreferenceConfigurations)
    protected readonly preferenceConfigurations: PreferenceConfigurations;

    @inject(JsonSchemaDataStore)
    protected readonly jsonSchemaData: JsonSchemaDataStore;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    protected readonly debouncedUpdateInMemoryResources = debounce(() => this.updateInMemoryResources(), DEBOUNCED_UPDATE_DELAY);

    registerSchemas(context: JsonSchemaRegisterContext): void {
        this.registerSchema(PreferenceScope.Default, context);
        this.registerSchema(PreferenceScope.User, context);
        this.registerSchema(PreferenceScope.Workspace, context);
        this.registerSchema(PreferenceScope.Folder, context);

        context.registerSchema({
            fileMatch: `file://**/${this.preferenceConfigurations.getConfigName()}.json`,
            url: this.getSchemaURIForScope(PreferenceScope.Folder).toString()
        });

        context.registerSchema({
            fileMatch: UserStorageUri.resolve(this.preferenceConfigurations.getConfigName() + '.json').toString(),
            url: this.getSchemaURIForScope(PreferenceScope.User).toString()
        });

        this.workspaceService.updateSchema('settings', { $ref: this.getSchemaURIForScope(PreferenceScope.Workspace).toString() });
        this.schemaProvider.onDidChangeSchema(() => this.debouncedUpdateInMemoryResources());
    }

    protected registerSchema(scope: PreferenceScope, context: JsonSchemaRegisterContext): void {
        const scopeStr = PreferenceScope[scope].toLowerCase();
        const uri = new URI(PREFERENCE_URI_PREFIX + scopeStr);

        this.jsonSchemaData.setSchema(uri, (this.schemaProvider.getJSONSchema(scope)));
    }

    protected updateInMemoryResources(): void {
        this.jsonSchemaData.setSchema(this.getSchemaURIForScope(PreferenceScope.Default),
            (this.schemaProvider.getJSONSchema(PreferenceScope.Default)));
        this.jsonSchemaData.setSchema(this.getSchemaURIForScope(PreferenceScope.User),
            this.schemaProvider.getJSONSchema(PreferenceScope.User));
        this.jsonSchemaData.setSchema(this.getSchemaURIForScope(PreferenceScope.Workspace),
            this.schemaProvider.getJSONSchema(PreferenceScope.Workspace));
        this.jsonSchemaData.setSchema(this.getSchemaURIForScope(PreferenceScope.Folder),
            this.schemaProvider.getJSONSchema(PreferenceScope.Folder));
    }

    protected getSchemaURIForScope(scope: PreferenceScope): URI {
        return new URI(PREFERENCE_URI_PREFIX + PreferenceScope[scope].toLowerCase());
    }
}
