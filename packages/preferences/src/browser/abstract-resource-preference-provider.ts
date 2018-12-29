/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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

import { inject, injectable, postConstruct } from 'inversify';
import * as jsoncparser from 'jsonc-parser';
import URI from '@theia/core/lib/common/uri';
import { Resource, ResourceProvider, MaybePromise, MessageService } from '@theia/core';
import { PreferenceProvider } from '@theia/core/lib/browser/preferences';

@injectable()
export abstract class AbstractResourcePreferenceProvider extends PreferenceProvider {

    // tslint:disable-next-line:no-any
    protected preferences: { [key: string]: any } = {};

    @inject(ResourceProvider) protected readonly resourceProvider: ResourceProvider;

    @inject(MessageService) protected readonly messageService: MessageService;

    protected resource: Promise<Resource>;

    @postConstruct()
    protected async init(): Promise<void> {
        const uri = await this.getUri();

        // In case if no workspace is opened there are no workspace settings.
        // There is nothing to contribute to preferences and we just skip it.
        if (!uri) {
            this._ready.resolve();
            return;
        }
        this.resource = this.resourceProvider(uri);

        // Try to read the initial content of the preferences.  The provider
        // becomes ready even if we fail reading the preferences, so we don't
        // hang the preference service.
        this.readPreferences()
            .then(() => this._ready.resolve())
            .catch(() => this._ready.resolve());

        const resource = await this.resource;
        this.toDispose.push(resource);
        if (resource.onDidChangeContents) {
            this.toDispose.push(resource.onDidChangeContents(content => this.readPreferences()));
        }
    }

    abstract getUri(): MaybePromise<URI | undefined>;

    // tslint:disable-next-line:no-any
    getPreferences(): { [key: string]: any } {
        return this.preferences;
    }

    // tslint:disable-next-line:no-any
    async setPreference(key: string, value: any): Promise<void> {
        const resource = await this.resource;
        if (resource.saveContents) {
            const content = await this.readContents();
            const formattingOptions = { tabSize: 3, insertSpaces: true, eol: '' };
            try {
                const edits = jsoncparser.modify(content, [key], value, { formattingOptions });
                const result = jsoncparser.applyEdits(content, edits);

                await resource.saveContents(result);
            } catch (e) {
                const message = `Failed to update the value of ${key}. Please check if ${resource.uri.toString()} is corrupted`;
                this.messageService.error(message);
                console.error(message, e.toString());
                return;
            }
            this.preferences[key] = value;
            this.onDidPreferencesChangedEmitter.fire(undefined);
        }
    }

    protected async readPreferences(): Promise<void> {
        const newContent = await this.readContents();
        const strippedContent = jsoncparser.stripComments(newContent);
        const jsonErrors: jsoncparser.ParseError[] = [];
        this.preferences = jsoncparser.parse(strippedContent, jsonErrors) || {};
        if (jsonErrors.length > 0) {
            const resourceUri = (await this.resource).uri.toString();
            const message = `Please check if ${resourceUri} is corrupted. Parsing json errors out.`;
            this.messageService.error(message);
            console.error(message, ...jsonErrors);
        }
        this.onDidPreferencesChangedEmitter.fire(undefined);
    }

    protected async readContents(): Promise<string> {
        try {
            const resource = await this.resource;
            return await resource.readContents();
        } catch {
            return '';
        }
    }

}
