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
import URI from '@theia/core/lib/common/uri';

@injectable()
export class JsonClientContribution extends BaseLanguageClientContribution {

    readonly id = JSON_LANGUAGE_ID;
    readonly name = JSON_LANGUAGE_NAME;

    constructor(
        @inject(Workspace) protected readonly workspace: Workspace,
        @inject(ResourceProvider) protected readonly resourceProvider: ResourceProvider,
        @inject(Languages) protected readonly languages: Languages,
        @inject(LanguageClientFactory) protected readonly languageClientFactory: LanguageClientFactory
    ) {
        super(workspace, languages, languageClientFactory);
    }

    protected get globPatterns() {
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

    protected onReady(languageClient: ILanguageClient): void {
        // handle content request
        languageClient.onRequest('vscode/content', async (uriPath: string) => {
            const uri = new URI(uriPath);
            const resource = await this.resourceProvider(uri);
            const text = await resource.readContents();
            return text;
        });
        super.onReady(languageClient);
        setTimeout(() => this.initializeJsonSchemaAssociations());
    }

    protected async initializeJsonSchemaAssociations(): Promise<void> {
        const client = await this.languageClient;
        const url = `${window.location.protocol}//schemastore.azurewebsites.net/api/json/catalog.json`;
        const response = await fetch(url);
        const schemas: SchemaData[] = (await response.json()).schemas!;
        const registry: { [pattern: string]: string[] } = {};
        for (const s of schemas) {
            if (s.fileMatch) {
                for (const p of s.fileMatch) {
                    registry[p] = [s.url];
                }
            }
        }
        client.sendNotification('json/schemaAssociations', registry);
    }

}

interface SchemaData {
    name: string;
    description: string;
    fileMatch?: string[];
    url: string;
    schema: any;
}
