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

    protected async updateSchemas(client: ILanguageClient): Promise<void> {
        this.schemaRegistry = {};
        this.updateJsonSchemaStoreSchemas();
        this.initializeJsonPreferencesAssociations().then(() => client.sendNotification('json/schemaAssociations', this.schemaRegistry));
    }

    protected updateJsonSchemaStoreSchemas(client?: ILanguageClient): void {
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
        if (client) {
            client.sendNotification('json/schemaAssociations', this.schemaRegistry);
        }
    }

    protected async setJsonPreferencesSchemas(schemaConfigs: JsonSchemaConfiguration[], scope: PreferenceScope, workspaceRoot?: string): Promise<void> {
        await this.asyncForEach(schemaConfigs, async (schemaConfig: JsonSchemaConfiguration) => {
            await this.asyncForEach(schemaConfig.fileMatch, async (fileMatch: string) => {
                if (!fileMatch.startsWith('/') && !fileMatch.match(/\w+:/)) {
                    fileMatch = '/' + fileMatch;
                }

                if (workspaceRoot) {
                    workspaceRoot = new URI(workspaceRoot).path.toString();
                    if (scope !== PreferenceScope.User) {
                        fileMatch = new Path(workspaceRoot).join(fileMatch).normalize().toString();
                    }
                }

                const fileUri = new URI(schemaConfig.url);
                if (fileUri.scheme === 'file') {
                    await this.fileSystem.exists(fileUri.toString()).then(async fileExists => {
                        const filePath = fileUri.path.toString();
                        if (fileExists) {
                            this.schemaRegistry[fileMatch] = [filePath];
                        } else {
                            if (workspaceRoot && !filePath.startsWith(workspaceRoot)) {
                                const absolutePath = new Path(workspaceRoot).join(filePath).normalize().toString();
                                await this.fileSystem.exists(absolutePath).then(exists => {
                                    if (exists) {
                                        this.schemaRegistry[fileMatch] = [absolutePath];
                                    } else {
                                        console.error('JSON schema configuration for fileMatch: \'' + fileMatch + '\' and url: \'' + absolutePath + '\' could not be registered.');
                                    }
                                });
                            } else {
                                console.error('JSON schema configuration for fileMatch: \'' + fileMatch + '\' and url: \'' + filePath + '\' could not be registered.');
                            }
                        }
                    });
                } else {
                    this.schemaRegistry[fileMatch] = [schemaConfig.url];
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

    protected async initializeJsonPreferencesAssociations(): Promise<void> {
        const userPreferenceValues = this.preferenceService.inspect<JsonSchemaConfiguration[]>('json.schemas');
        if (userPreferenceValues) {
            if (userPreferenceValues.globalValue) {
                await this.setJsonPreferencesSchemas(userPreferenceValues.globalValue, PreferenceScope.User);
            }
        }

        if (this.workspaceService.isMultiRootWorkspaceOpened) {
            await this.asyncForEach(this.workspace.workspaceFolders, async (workspaceFolder: { name: string; uri: { path: string; }; }) => {
                const workspaceFolderPath = workspaceFolder.uri.path;
                const multiRootInspectValue = this.preferenceService.inspect<JsonSchemaConfiguration[]>('json.schemas', workspaceFolderPath);
                if (multiRootInspectValue) {
                    if (multiRootInspectValue.workspaceValue) {
                        await this.setJsonPreferencesSchemas(multiRootInspectValue.workspaceValue, PreferenceScope.Workspace, workspaceFolderPath);
                    }
                    if (multiRootInspectValue.workspaceFolderValue) {
                        await this.setJsonPreferencesSchemas(multiRootInspectValue.workspaceFolderValue, PreferenceScope.Folder, workspaceFolderPath);
                    }
                }
            });
        } else {
            const workspaceRootPath = this.workspace.rootPath || undefined;
            const singleRootInspectValue = this.preferenceService.inspect<JsonSchemaConfiguration[]>('json.schemas', workspaceRootPath);
            if (singleRootInspectValue) {
                if (singleRootInspectValue.workspaceValue) {
                    await this.setJsonPreferencesSchemas(singleRootInspectValue.workspaceValue, PreferenceScope.Workspace, workspaceRootPath);
                }
            }
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async asyncForEach(array: any[], callback: any): Promise<void> {
        for (const element of array) {
            await callback(element);
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
