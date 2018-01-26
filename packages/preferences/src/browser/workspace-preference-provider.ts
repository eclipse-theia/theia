/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { AbstractResourcePreferenceProvider } from './abstract-resource-preference-provider';

@injectable()
export class WorkspacePreferenceProvider extends AbstractResourcePreferenceProvider {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    protected async getUri(): Promise<URI> {
        const root = await this.workspaceService.root;
        if (root) {
            const rootUri = new URI(root.uri);
            return rootUri.resolve('.theia').resolve('settings.json');
        }
        return new Promise<URI>(() => { });
    }

}
