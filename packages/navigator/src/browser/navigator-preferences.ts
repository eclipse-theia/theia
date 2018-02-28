/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { interfaces } from 'inversify';
import { createPreferenceProxy, PreferenceProxy, PreferenceService, PreferenceContribution, PreferenceSchema } from '@theia/core/lib/browser';

// tslint:disable:max-line-length

export const FileNavigatorConfigSchema: PreferenceSchema = {
    'type': 'object',
    properties: {
        'navigator.exclude': {
            type: 'object',
            description: `
Configure glob patterns for excluding files and folders from the navigator. A resource that matches any of the enabled patterns, will be filtered out from the navigator. For more details about the exclusion patterns, see: \`man 5 gitignore\`.`,
            default: {
                "**/.git": true
            }
        }
    }
};

export interface FileNavigatorConfiguration {
    'navigator.exclude': { [key: string]: boolean };
}

export const FileNavigatorPreferences = Symbol('NavigatorPreferences');
export type FileNavigatorPreferences = PreferenceProxy<FileNavigatorConfiguration>;

export function createNavigatorPreferences(preferences: PreferenceService): FileNavigatorPreferences {
    return createPreferenceProxy(preferences, FileNavigatorConfigSchema);
}

export function bindFileNavigatorPreferences(bind: interfaces.Bind): void {
    bind(FileNavigatorPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        return createNavigatorPreferences(preferences);
    });
    bind(PreferenceContribution).toConstantValue({ schema: FileNavigatorConfigSchema });
}
