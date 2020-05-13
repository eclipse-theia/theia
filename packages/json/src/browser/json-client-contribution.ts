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

import { injectable, inject } from 'inversify';
import {
    BaseLanguageClientContribution,
    Workspace,
    Languages,
    LanguageClientFactory,
    ILanguageClient,
    DocumentSelector
} from '@theia/languages/lib/browser';
import { JSON_LANGUAGE_ID, JSON_LANGUAGE_NAME, JSONC_LANGUAGE_ID } from '../common';
import { ResourceProvider } from '@theia/core';
import { DisposableCollection } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { Path } from '@theia/core/lib/common/path';
import { JsonPreferences } from './json-preferences';
import { JsonSchemaStore, JsonSchemaConfiguration } from '@theia/core/lib/browser/json-schema-store';
import { Endpoint, PreferenceScope, PreferenceService } from '@theia/core/lib/browser';
import { FileSystem } from '@theia/filesystem/lib/common';

@injectable()
export class JsonClientContribution extends BaseLanguageClientContribution {

    readonly id = JSON_LANGUAGE_ID;
    readonly name = JSON_LANGUAGE_NAME;

    protected schemaRegistry: { [pattern: string]: string[] };

    constructor(
        @inject(Workspace) protected readonly workspace: Workspace,
        @inject(ResourceProvider) protected readonly resourceProvider: ResourceProvider,
        @inject(Languages) protected readonly languages: Languages,
        @inject(LanguageClientFactory) protected readonly languageClientFactory: LanguageClientFactory,
        @inject(JsonPreferences) protected readonly preferences: JsonPreferences,
        @inject(PreferenceService) protected readonly preferenceService: PreferenceService,
        @inject(JsonSchemaStore) protected readonly jsonSchemaStore: JsonSchemaStore,
        @inject(FileSystem) protected readonly fileSystem: FileSystem
    ) {
        super(workspace, languages, languageClientFactory);
        this.initializeJsonSchemaStoreAssociations();
    }

    protected updateSchemas(client: ILanguageClient): void {
        this.schemaRegistry = {};
        this.updateJsonSchemaStoreAssociations();
        this.initializeJsonPreferencesAssociations();
        client.sendNotification('json/schemaAssociations', this.schemaRegistry);
    }

    protected updateJsonSchemaStoreAssociations(): void {
        const schemaStoreConfigs = [...this.jsonSchemaStore.getJsonSchemaConfigurations()];
        for (const schemaConfig of schemaStoreConfigs) {
            if (schemaConfig.fileMatch) {
                for (let fileMatch of schemaConfig.fileMatch) {
                    if (!fileMatch.startsWith('/') && !fileMatch.match(/\w+:/)) {
                        fileMatch = '/' + fileMatch;
                    }
                    this.schemaRegistry[fileMatch] = [schemaConfig.url];
                }
            }
        }
    }

    protected setJsonPreferencesSchemas(schemaConfigs: JsonSchemaConfiguration[], scope: PreferenceScope, rootPath?: string): void {
        schemaConfigs.forEach((schemaConfig: JsonSchemaConfiguration) => {
            schemaConfig.fileMatch.forEach((fileMatch: string) => {
                if (!fileMatch.startsWith('/') && !fileMatch.match(/\w+:/)) {
                    fileMatch = '/' + fileMatch;
                }
                let url = schemaConfig.url;
                if (rootPath) {
                    fileMatch = new Path(rootPath).join(fileMatch).normalize().toString();
                    if (url.match(rootPath)) {
                        url = new URI(new Path(url).toString()).toString();
                    } else if ((url.startsWith('.') || url.startsWith('/') || url.match(/^\w+\//))) {
                        url = new URI(rootPath).resolve(url).normalizePath().toString();
                    }
                }
                if (url) {
                    this.schemaRegistry[fileMatch] = [url];
                }
            });
        });
    }

    protected get globPatterns(): string[] {
        return [
            '**/*.json',
            '**/*.jsonc',
        ];
    }

    protected get documentSelector(): DocumentSelector | undefined {
        return [this.id, JSONC_LANGUAGE_ID];
    }

    protected get configurationSection(): string[] {
        return [this.id];
    }

    protected get initializationOptions(): {} {
        return {};
    }

    protected onReady(languageClient: ILanguageClient, toStop: DisposableCollection): void {
        super.onReady(languageClient, toStop);
        // handle content request
        languageClient.onRequest('vscode/content', async (uriPath: string) => {
            const uri = new URI(uriPath);
            const resource = await this.resourceProvider(uri);
            const text = await resource.readContents();
            return text;
        });
        toStop.push(this.preferences.onPreferenceChanged(e => {
            if (e.preferenceName === 'json.schemas') {
                this.updateSchemas(languageClient);
            }
        }));
        toStop.push(this.jsonSchemaStore.onSchemasChanged(() => this.updateSchemas(languageClient)));
        this.updateSchemas(languageClient);
    }

    protected async initializeJsonSchemaStoreAssociations(): Promise<void> {
        const url = `${new Endpoint().httpScheme}//schemastore.azurewebsites.net/api/json/catalog.json`;
        const response = await fetch(url);
        const schemas: SchemaData[] = (await response.json()).schemas!;
        for (const s of schemas) {
            if (s.fileMatch) {
                this.jsonSchemaStore.registerSchema({
                    fileMatch: s.fileMatch,
                    url: s.url
                });
            }
        }
    }

    protected initializeJsonPreferencesAssociations(): void {
        const userSettings = this.preferenceService.inspect<JsonSchemaConfiguration[]>('json.schemas');
        if (userSettings) {
            if (userSettings.globalValue) {
                this.setJsonPreferencesSchemas(userSettings.globalValue, PreferenceScope.User);
            }
        }

        if (this.workspaceService.isMultiRootWorkspaceOpened) {
            this.workspace.workspaceFolders.forEach((workspaceFolder: { name: string; uri: { path: string; }; }) => {
                const workspaceFolderPath = workspaceFolder.uri.path;
                const folderSettings = this.preferenceService.inspect<JsonSchemaConfiguration[]>('json.schemas', workspaceFolderPath);
                if (folderSettings && folderSettings.workspaceFolderValue) {
                    this.setJsonPreferencesSchemas(folderSettings.workspaceFolderValue, PreferenceScope.Folder, workspaceFolderPath);
                }
            });
        }
    }
}

interface SchemaData {
    name: string;
    description: string;
    fileMatch?: string[];
    url: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    schema: any;
}
