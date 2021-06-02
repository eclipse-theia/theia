/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { interfaces } from '@theia/core/shared/inversify';
import {
    createPreferenceProxy,
    PreferenceProxy,
    PreferenceService,
    PreferenceSchema,
    PreferenceContribution
} from '@theia/core/lib/browser/preferences';
import { SUPPORTED_ENCODINGS } from '@theia/core/lib/browser/supported-encodings';
import { environment } from '@theia/core/shared/@theia/application-package/lib/environment';

// See https://github.com/Microsoft/vscode/issues/30180
export const WIN32_MAX_FILE_SIZE_MB = 300; // 300 MB
export const GENERAL_MAX_FILE_SIZE_MB = 16 * 1024; // 16 GB

export const MAX_FILE_SIZE_MB = environment.electron.is() ? process.arch === 'ia32' ? WIN32_MAX_FILE_SIZE_MB : GENERAL_MAX_FILE_SIZE_MB : 32;

export const filesystemPreferenceSchema: PreferenceSchema = {
    'type': 'object',
    'properties': {
        'files.watcherExclude': {
            'description': 'List of paths to exclude from the filesystem watcher',
            'additionalProperties': {
                'type': 'boolean'
            },
            'default': {
                '**/.git/objects/**': true,
                '**/.git/subtree-cache/**': true,
                '**/node_modules/**': true
            },
            'scope': 'resource'
        },
        'files.exclude': {
            'type': 'object',
            'default': { '**/.git': true, '**/.svn': true, '**/.hg': true, '**/CVS': true, '**/.DS_Store': true },
            'description': 'Configure glob patterns for excluding files and folders.',
            'scope': 'resource'
        },
        'files.enableTrash': {
            'type': 'boolean',
            'default': true,
            'description': 'Moves files/folders to the OS trash (recycle bin on Windows) when deleting. Disabling this will delete files/folders permanently.'
        },
        'files.associations': {
            'type': 'object',
            'description': 'Configure file associations to languages (e.g. \"*.extension\": \"html\"). \
These have precedence over the default associations of the languages installed.'
        },
        'files.autoGuessEncoding': {
            'type': 'boolean',
            'default': false,
            'description': 'When enabled, the editor will attempt to guess the character set encoding when opening files. This setting can also be configured per language.',
            'scope': 'language-overridable',
            'included': Object.keys(SUPPORTED_ENCODINGS).length > 1
        },
        'files.participants.timeout': {
            type: 'number',
            default: 5000,
            markdownDescription: 'Timeout in milliseconds after which file participants for create, rename, and delete are cancelled. Use `0` to disable participants.'
        },
        'files.maxFileSizeMB': {
            type: 'number',
            default: MAX_FILE_SIZE_MB,
            markdownDescription: 'Controls the max file size in MB which is possible to open.'
        },
        'files.trimTrailingWhitespace': {
            'type': 'boolean',
            'default': false,
            'description': 'When enabled, will trim trailing whitespace when saving a file.',
            'scope': 'language-overridable'
        }
    }
};

export interface FileSystemConfiguration {
    'files.watcherExclude': { [globPattern: string]: boolean };
    'files.exclude': { [key: string]: boolean };
    'files.enableTrash': boolean;
    'files.associations': { [filepattern: string]: string };
    'files.encoding': string;
    'files.autoGuessEncoding': boolean;
    'files.participants.timeout': number;
    'files.maxFileSizeMB': number;
    'files.trimTrailingWhitespace': boolean;
}

export const FileSystemPreferences = Symbol('FileSystemPreferences');
export type FileSystemPreferences = PreferenceProxy<FileSystemConfiguration>;

export function createFileSystemPreferences(preferences: PreferenceService): FileSystemPreferences {
    return createPreferenceProxy(preferences, filesystemPreferenceSchema);
}

export function bindFileSystemPreferences(bind: interfaces.Bind): void {
    bind(FileSystemPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        return createFileSystemPreferences(preferences);
    }).inSingletonScope();

    bind(PreferenceContribution).toConstantValue({ schema: filesystemPreferenceSchema });
}
