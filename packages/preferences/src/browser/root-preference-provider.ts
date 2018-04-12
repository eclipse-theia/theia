/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { AbstractResourcePreferenceProvider } from './abstract-resource-preference-provider';

@injectable()
export class RootPreferenceProvider extends AbstractResourcePreferenceProvider {

    async getUri(): Promise<URI> {
        const activeRoot = await this.workspaceService.activeRoot;
        if (activeRoot) {
            const rootUri = new URI(activeRoot.uri);
            return rootUri.resolve('.theia').resolve('settings.json');
        }
        return new Promise<URI>(() => { });
    }

    protected async readPreferences(): Promise<void> {
        return super.readPreferences()
            .then(() => this.workspaceService.workspaceSettings)
            .then(settings => {
                if (Object.keys(settings).length === 0) {
                    return this.workspaceService.updateWorkspaceSettings(this.workspaceId, this.preferences);
                }
                return;
            });
    }
}
