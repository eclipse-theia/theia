/* --------------------------------------------------------------------------------------------
 * Copyright (c) 2017 TypeFox GmbH (http://www.typefox.io). All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { interfaces } from "inversify";
import {
    createPreferenceProxy,
    PreferenceContribution,
    PreferenceProxy,
    PreferenceService,
} from '../../preferences/common';

export interface FileSystemConfiguration {
    'files.watcherExclude': { [globPattern: string]: boolean }
}
export const defaultFileSystemConfiguration: FileSystemConfiguration = {
    'files.watcherExclude': {
        "**/.git/objects/**": true,
        "**/.git/subtree-cache/**": true,
        "**/node_modules/**": true
    }
}
export const FileSystemPreferences = Symbol('FileSystemPreferences');
export type FileSystemPreferences = PreferenceProxy<FileSystemConfiguration>;

export function createFileSystemPreferences(preferences: PreferenceService): FileSystemPreferences {
    return createPreferenceProxy(preferences, defaultFileSystemConfiguration);
}

export function bindFileSystemPreferences(bind: interfaces.Bind): void {
    bind(FileSystemPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get(PreferenceService);
        return createFileSystemPreferences(preferences);
    });

    bind(PreferenceContribution).toConstantValue({
        preferences: [{
            name: 'files.watcherExclude',
            defaultValue: defaultFileSystemConfiguration['files.watcherExclude'],
            description: "Configure glob patterns of file paths to exclude from file watching."
        }]
    });
}