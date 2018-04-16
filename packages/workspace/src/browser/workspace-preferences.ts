/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { interfaces } from "inversify";
import {
    createPreferenceProxy,
    PreferenceProxy,
    PreferenceService,
    PreferenceSchema,
    PreferenceContribution
} from '@theia/core/lib/browser/preferences';

export const workspacePreferenceSchema: PreferenceSchema = {
    "type": "object",
    "properties": {
        "workspace.preserveWindow": {
            "description": "Enable opening workspaces in current window",
            "additionalProperties": {
                "type": "boolean"
            },
            "default": false
        }
    }
};

export interface WorkspaceConfiguration {
    'workspace.preserveWindow': boolean
}

export const WorkspacePreferences = Symbol('WorkspacePreferences');
export type WorkspacePreferences = PreferenceProxy<WorkspaceConfiguration>;

export function createWorkspacePreferences(preferences: PreferenceService): WorkspacePreferences {
    return createPreferenceProxy(preferences, workspacePreferenceSchema);
}

export function bindWorkspacePreferences(bind: interfaces.Bind): void {
    bind(WorkspacePreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        return createWorkspacePreferences(preferences);
    }).inSingletonScope();

    bind(PreferenceContribution).toConstantValue({ schema: workspacePreferenceSchema });
}
