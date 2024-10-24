// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { interfaces } from '@theia/core/shared/inversify';
import {
    createPreferenceProxy,
    PreferenceProxy,
    PreferenceService,
    PreferenceSchema,
    PreferenceContribution
} from '@theia/core/lib/browser/preferences';
import { SUPPORTED_ENCODINGS } from '@theia/core/lib/browser/supported-encodings';
import { nls } from '@theia/core/lib/common/nls';

// See https://github.com/Microsoft/vscode/issues/30180
export const WIN32_MAX_FILE_SIZE_MB = 300; // 300 MB
export const GENERAL_MAX_FILE_SIZE_MB = 16 * 1024; // 16 GB

export const MAX_FILE_SIZE_MB = typeof process === 'object'
    ? process.arch === 'ia32'
        ? WIN32_MAX_FILE_SIZE_MB
        : GENERAL_MAX_FILE_SIZE_MB
    : 32;

export const filesystemPreferenceSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        'files.watcherExclude': {
            // eslint-disable-next-line max-len
            description: nls.localizeByDefault('Configure paths or [glob patterns](https://aka.ms/vscode-glob-patterns) to exclude from file watching. Paths can either be relative to the watched folder or absolute. Glob patterns are matched relative from the watched folder. When you experience the file watcher process consuming a lot of CPU, make sure to exclude large folders that are of less interest (such as build output folders).'),
            additionalProperties: {
                type: 'boolean'
            },
            default: {
                '**/.git/objects/**': true,
                '**/.git/subtree-cache/**': true
            },
            scope: 'resource'
        },
        'files.exclude': {
            type: 'object',
            default: { '**/.git': true, '**/.svn': true, '**/.hg': true, '**/CVS': true, '**/.DS_Store': true },
            // eslint-disable-next-line max-len
            markdownDescription: nls.localize('theia/filesystem/filesExclude', 'Configure glob patterns for excluding files and folders. For example, the file Explorer decides which files and folders to show or hide based on this setting.'),
            scope: 'resource'
        },
        'files.enableTrash': {
            type: 'boolean',
            default: true,
            description: nls.localizeByDefault('Moves files/folders to the OS trash (recycle bin on Windows) when deleting. Disabling this will delete files/folders permanently.')
        },
        'files.associations': {
            type: 'object',
            markdownDescription: nls.localizeByDefault(
                // eslint-disable-next-line max-len
                'Configure [glob patterns](https://aka.ms/vscode-glob-patterns) of file associations to languages (for example `\"*.extension\": \"html\"`). Patterns will match on the absolute path of a file if they contain a path separator and will match on the name of the file otherwise. These have precedence over the default associations of the languages installed.'
            )
        },
        'files.autoGuessEncoding': {
            type: 'boolean',
            default: false,
            // eslint-disable-next-line max-len
            description: nls.localizeByDefault('When enabled, the editor will attempt to guess the character set encoding when opening files. This setting can also be configured per language. Note, this setting is not respected by text search. Only {0} is respected.', '`#files.encoding#`'),
            scope: 'language-overridable',
            included: Object.keys(SUPPORTED_ENCODINGS).length > 1
        },
        'files.participants.timeout': {
            type: 'number',
            default: 5000,
            markdownDescription: nls.localizeByDefault(
                'Timeout in milliseconds after which file participants for create, rename, and delete are cancelled. Use `0` to disable participants.'
            )
        },
        'files.maxFileSizeMB': {
            type: 'number',
            default: MAX_FILE_SIZE_MB,
            markdownDescription: nls.localize('theia/filesystem/maxFileSizeMB', 'Controls the max file size in MB which is possible to open.')
        },
        'files.trimTrailingWhitespace': {
            type: 'boolean',
            default: false,
            description: nls.localizeByDefault('When enabled, will trim trailing whitespace when saving a file.'),
            scope: 'language-overridable'
        },
        'files.maxConcurrentUploads': {
            type: 'integer',
            default: 1,
            description: nls.localize(
                'theia/filesystem/maxConcurrentUploads',
                'Maximum number of concurrent files to upload when uploading multiple files. 0 means all files will be uploaded concurrently.'
            ),
        }
    }
};

export interface FileSystemConfiguration {
    'files.watcherExclude': { [globPattern: string]: boolean }
    'files.exclude': { [key: string]: boolean }
    'files.enableTrash': boolean
    'files.associations': { [filepattern: string]: string }
    'files.encoding': string
    'files.autoGuessEncoding': boolean
    'files.participants.timeout': number
    'files.maxFileSizeMB': number
    'files.trimTrailingWhitespace': boolean
    'files.maxConcurrentUploads': number
}

export const FileSystemPreferenceContribution = Symbol('FilesystemPreferenceContribution');
export const FileSystemPreferences = Symbol('FileSystemPreferences');
export type FileSystemPreferences = PreferenceProxy<FileSystemConfiguration>;

export function createFileSystemPreferences(preferences: PreferenceService, schema: PreferenceSchema = filesystemPreferenceSchema): FileSystemPreferences {
    return createPreferenceProxy(preferences, schema);
}

export function bindFileSystemPreferences(bind: interfaces.Bind): void {
    bind(FileSystemPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        const contribution = ctx.container.get<PreferenceContribution>(FileSystemPreferenceContribution);
        return createFileSystemPreferences(preferences, contribution.schema);
    }).inSingletonScope();
    bind(FileSystemPreferenceContribution).toConstantValue({ schema: filesystemPreferenceSchema });
    bind(PreferenceContribution).toService(FileSystemPreferenceContribution);
}
