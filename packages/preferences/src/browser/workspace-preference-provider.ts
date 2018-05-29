/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from 'inversify';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { WorkspaceData, WorkspaceSettings } from '@theia/workspace/lib/common/workspace-protocol';
import { AbstractResourcePreferenceProvider } from './abstract-resource-preference-provider';
import URI from '@theia/core/lib/common/uri';

@injectable()
export class WorkspacePreferenceProvider extends AbstractResourcePreferenceProvider {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    async getUri(): Promise<URI> {
        const workspaceConfigStat = await this.workspaceService.workspaceConfig;
        if (workspaceConfigStat) {
            return new URI(workspaceConfigStat.uri);
        }
        return new Promise<URI>(() => { });
    }

    protected async readJson(): Promise<WorkspaceSettings> {
        const newPreferences = (await super.readJson() as WorkspaceData).settings;
        if (this.preferencesChanged(newPreferences)) {
            await this.workspaceService.updateWorkspaceSettings(this.workspaceId, newPreferences);
        }
        return newPreferences;
    }
}
