/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable, postConstruct } from 'inversify';
import * as jsoncparser from 'jsonc-parser';
import URI from '@theia/core/lib/common/uri';
import { ILogger, Resource, ResourceProvider, MaybePromise } from '@theia/core/lib/common';
import { PreferenceProvider } from '@theia/core/lib/browser/preferences';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';

@injectable()
export abstract class AbstractResourcePreferenceProvider extends PreferenceProvider {

    protected preferences: { [key: string]: any } = {};

    @inject(ILogger) protected readonly logger: ILogger;

    @inject(ResourceProvider) protected readonly resourceProvider: ResourceProvider;

    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;

    protected resource: Promise<Resource>;
    protected workspaceId: string | undefined;

    @postConstruct()
    protected async init(): Promise<void> {
        this.workspaceId = await this.workspaceService.workspaceId;
        const uri = await this.getUri();
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

    abstract getUri(): MaybePromise<URI>;

    getPreferences(): { [key: string]: any } {
        return this.preferences;
    }

    async setPreference(key: string, value: any): Promise<void> {
        const resource = await this.resource;
        if (resource.saveContents) {
            const content = await resource.readContents();
            const formattingOptions = { tabSize: 3, insertSpaces: true, eol: '' };
            const edits = jsoncparser.modify(content, [key], value, { formattingOptions });
            const result = jsoncparser.applyEdits(content, edits);

            await resource.saveContents(result);
            this.onDidPreferencesChangedEmitter.fire(undefined);
        }
    }

    protected async readPreferences(): Promise<void> {
        this.preferences = await this.readJson();
        this.onDidPreferencesChangedEmitter.fire(undefined);
    }

    protected async readContents(): Promise<string> {
        try {
            const resource = await this.resource;
            console.log(`${this.constructor.name} resource uri ${resource.uri.toString()}`);
            return await resource.readContents();
        } catch {
            return '';
        }
    }

    protected async readJson(): Promise<object> {
        const newContent = await this.readContents();
        const strippedContent = jsoncparser.stripComments(newContent);
        return jsoncparser.parse(strippedContent);
    }

    protected preferencesChanged(newPreferences: { [key: string]: any }): boolean {
        const oldPrefNames = Object.keys(this.preferences);
        const newPrefNames = Object.keys(newPreferences);
        if (oldPrefNames.length === newPrefNames.length) {
            newPrefNames.forEach(pref => {
                if (newPreferences[pref] !== this.preferences[pref]) {
                    return false;
                }
            });
            return true;
        }
        return false;
    }
}
