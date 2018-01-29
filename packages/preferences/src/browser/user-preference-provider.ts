/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from 'inversify';
import { ResourceProvider, Resource, Event, Emitter } from "@theia/core/lib/common";
import { ILogger } from "@theia/core/lib/common";
import URI from '@theia/core/lib/common/uri';
import { DisposableCollection } from '@theia/core/lib/common';
import { PreferenceProvider, NewPreferencesEvent } from '@theia/preferences-api/lib/browser';
import * as jsoncparser from "jsonc-parser";
import { ParseError } from "jsonc-parser";

@injectable()
export class UserPreferenceProvider implements PreferenceProvider {
    protected preferencesCache: { [key: string]: any } = {};

    protected readonly onNewPreferencesEmitter = new Emitter<NewPreferencesEvent>();

    protected readonly toDispose = new DisposableCollection();

    protected resolveReady: () => void;

    readonly ready = new Promise<void>(resolve => {
        this.resolveReady = resolve;
    });

    protected preferenceResource: Promise<Resource>;

    constructor(
        @inject(ResourceProvider) protected readonly provider: ResourceProvider,
        @inject(ILogger) protected readonly logger: ILogger,
    ) { }

    async init(): Promise<void> {
        this.preferenceResource = this.provider(new URI('user_storage:settings.json'));
        return this.preferenceResource.then(resource => {
            this.resolveReady();

            if (resource.onDidChangeContents) {
                resource.onDidChangeContents(content => this.readPreferences());
            }
            this.readPreferences();
            this.toDispose.push(resource);
        });
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected async readPreferences(): Promise<void> {
        const resource = await this.preferenceResource;
        const newContent = await resource.readContents();
        const strippedContent = jsoncparser.stripComments(newContent);
        const errors: ParseError[] = [];
        const preferences = jsoncparser.parse(strippedContent, errors);
        if (errors.length) {
            for (const error of errors) {
                this.logger.error("JSON parsing error", error);
            }
        }
        this.preferencesCache = preferences;
        /* Tell the service to recalculate the preferences with scopes */
        this.onNewPreferencesEmitter.fire({});
    }

    has(preferenceName: string): boolean {
        return this.preferencesCache[preferenceName] !== undefined;
    }

    getPreferences(): { [key: string]: any } {
        return this.preferencesCache;
    }

    get onNewPreferences(): Event<NewPreferencesEvent> {
        return this.onNewPreferencesEmitter.event;
    }
}
