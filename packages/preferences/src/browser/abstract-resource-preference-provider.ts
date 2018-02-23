/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable, postConstruct } from 'inversify';
import * as jsoncparser from "jsonc-parser";
import URI from '@theia/core/lib/common/uri';
import { ILogger, DisposableCollection, Resource, Event, Emitter, ResourceProvider, MaybePromise } from "@theia/core/lib/common";
import { PreferenceProvider } from '@theia/core/lib/browser/preferences';

@injectable()
export abstract class AbstractResourcePreferenceProvider implements PreferenceProvider {

    protected preferences: { [key: string]: any } = {};

    protected readonly onDidPreferencesChangedEmitter = new Emitter<void>();
    readonly onDidPreferencesChanged: Event<void> = this.onDidPreferencesChangedEmitter.event;

    protected readonly toDispose = new DisposableCollection();

    @inject(ILogger) protected readonly logger: ILogger;

    @inject(ResourceProvider) protected readonly resourceProvider: ResourceProvider;

    protected resource: Promise<Resource>;

    @postConstruct()
    protected async init(): Promise<void> {
        const uri = await this.getUri();
        this.resource = this.resourceProvider(uri);
        this.readPreferences();

        const resource = await this.resource;
        this.toDispose.push(resource);
        if (resource.onDidChangeContents) {
            this.toDispose.push(resource.onDidChangeContents(content => this.readPreferences()));
        }
    }

    protected abstract getUri(): MaybePromise<URI>;

    dispose(): void {
        this.toDispose.dispose();
    }

    getPreferences(): { [key: string]: any } {
        return this.preferences;
    }

    protected async readPreferences(): Promise<void> {
        const newContent = await this.readContents();
        const strippedContent = jsoncparser.stripComments(newContent);
        this.preferences = jsoncparser.parse(strippedContent);
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
