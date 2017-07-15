/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { interfaces } from "inversify";
/*import {
    createPreferenceProxy,
    PreferenceContribution,
    PreferenceProxy,
    PreferenceService,
} from '@theia/preferences/lib/common';*/

export interface FileSystemConfiguration {
    'files.watcherExclude': { [globPattern: string]: boolean }
}
export const defaultFileSystemConfiguration: FileSystemConfiguration = {
    'files.watcherExclude': {
        "**/.git/objects/**": true,
        "**/.git/subtree-cache/**": true,
        "**/node_modules/**": true
    }
}/*
export const FileSystemPreferences = Symbol('FileSystemPreferences');
export type FileSystemPreferences = PreferenceProxy<FileSystemConfiguration>;

export function createFileSystemPreferences(preferences: PreferenceService): FileSystemPreferences {
    return createPreferenceProxy(preferences, defaultFileSystemConfiguration);
}*/

export function bindFileSystemPreferences(bind: interfaces.Bind): void {
    /*bind(FileSystemPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get(PreferenceService);
        return createFileSystemPreferences(preferences);
    });

    bind(PreferenceContribution).toConstantValue({
        preferences: [{
            name: 'files.watcherExclude',
            defaultValue: defaultFileSystemConfiguration['files.watcherExclude'],
            description: "Configure glob patterns of file paths to exclude from file watching."
        }]
    });*/
}