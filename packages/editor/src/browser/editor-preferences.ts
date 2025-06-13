// *****************************************************************************
// Copyright (C) 2018 Ericsson and others.
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
    PreferenceContribution,
    PreferenceSchema,
    PreferenceChangeEvent,
    PreferenceScope,
} from '@theia/core/lib/browser/preferences';
import { PreferenceProxyFactory } from '@theia/core/lib/browser/preferences/injectable-preference-proxy';
import { nls } from '@theia/core/lib/common/nls';
import { environment } from '@theia/core';
import { editorGeneratedPreferenceProperties, GeneratedEditorPreferences } from './editor-generated-preference-schema';

/* eslint-disable max-len,no-null/no-null */
// #region src/vs/workbench/contrib/codeActions/browser/codeActionsContribution.ts

const codeActionsContributionSchema: PreferenceSchema['properties'] = {
    'editor.codeActionsOnSave': {
        oneOf: [
            {
                type: 'object',
                properties: {
                    'source.fixAll': {
                        type: 'boolean',
                        description: nls.localizeByDefault('Controls whether \'{0}\' actions should be run on file save.', 'quickfix')
                    }
                },
                additionalProperties: {
                    type: 'boolean'
                },
            },
            {
                type: 'array',
                items: { type: 'string' }
            }
        ],
        default: {},
        markdownDescription: nls.localizeByDefault('Run Code Actions for the editor on save. Code Actions must be specified and the editor must not be shutting down. When {0} is set to `afterDelay`, Code Actions will only be run when the file is saved explicitly. Example: `"source.organizeImports": "explicit" `'),
        scope: 'language-overridable',
    }
};

interface CodeActionsContributionProperties {
    'editor.codeActionsOnSave': string[] | ({ 'source.fixAll': boolean } & Record<string, boolean>)
}

// #endregion

// #region src/vs/workbench/contrib/files/browser/files.contribution.ts
const fileContributionSchema: PreferenceSchema['properties'] = {
    'editor.formatOnSave': {
        'type': 'boolean',
        'description': nls.localizeByDefault('Format a file on save. A formatter must be available and the editor must not be shutting down. When {0} is set to `afterDelay`, the file will only be formatted when saved explicitly.', '`#files.autoSave#`'),
        'scope': PreferenceScope.fromString('language-overridable'),
    },
    'editor.formatOnSaveMode': {
        'type': 'string',
        'default': 'file',
        'enum': [
            'file',
            'modifications',
            'modificationsIfAvailable'
        ],
        'enumDescriptions': [
            nls.localizeByDefault('Format the whole file.'),
            nls.localizeByDefault('Format modifications (requires source control).'),
            nls.localizeByDefault("Will attempt to format modifications only (requires source control). If source control can't be used, then the whole file will be formatted."),
        ],
        'markdownDescription': nls.localizeByDefault('Controls if format on save formats the whole file or only modifications. Only applies when `#editor.formatOnSave#` is enabled.'),
        'scope': PreferenceScope.fromString('language-overridable'),
    },
    // Include this, even though it is not strictly an `editor`preference.
    'files.eol': {
        'type': 'string',
        'enum': [
            '\n',
            '\r\n',
            'auto'
        ],
        'enumDescriptions': [
            nls.localizeByDefault('LF'),
            nls.localizeByDefault('CRLF'),
            nls.localizeByDefault('Uses operating system specific end of line character.')
        ],
        'default': 'auto',
        'description': nls.localizeByDefault('The default end of line character.'),
        'scope': PreferenceScope.fromString('language-overridable')
    },
    // We used to call these `editor.autoSave` and `editor.autoSaveDelay`.
    'files.autoSave': {
        'type': 'string',
        'enum': ['off', 'afterDelay', 'onFocusChange', 'onWindowChange'],
        'markdownEnumDescriptions': [
            nls.localizeByDefault('An editor with changes is never automatically saved.'),
            nls.localizeByDefault('An editor with changes is automatically saved after the configured `#files.autoSaveDelay#`.'),
            nls.localizeByDefault('An editor with changes is automatically saved when the editor loses focus.'),
            nls.localizeByDefault('An editor with changes is automatically saved when the window loses focus.')
        ],
        'default': environment.electron.is() ? 'off' : 'afterDelay',
        'markdownDescription': nls.localizeByDefault('Controls [auto save](https://code.visualstudio.com/docs/editor/codebasics#_save-auto-save) of editors that have unsaved changes.')
    },
    'files.autoSaveDelay': {
        'type': 'number',
        'default': 1000,
        'minimum': 0,
        'markdownDescription': nls.localizeByDefault('Controls the delay in milliseconds after which an editor with unsaved changes is saved automatically. Only applies when `#files.autoSave#` is set to `{0}`.', 'afterDelay')
    },
    'files.refactoring.autoSave': {
        'type': 'boolean',
        'default': true,
        'description': nls.localizeByDefault('Controls if files that were part of a refactoring are saved automatically')
    }
};

interface FileContributionEditorPreferences {
    'editor.formatOnSave': boolean;
    'editor.formatOnSaveMode': 'file' | 'modifications' | 'modificationsIfAvailable';
    'files.eol': '\n' | '\r\n' | 'auto';
    'files.autoSave': 'off' | 'afterDelay' | 'onFocusChange' | 'onWindowChange';
    'files.autoSaveDelay': number;
    'files.refactoring.autoSave': boolean
}
// #endregion

// #region src/vs/workbench/contrib/format/browser/formatActionsMultiple.ts
// This schema depends on a lot of private stuff in the file, so this is a stripped down version.
const formatActionsMultipleSchema: PreferenceSchema['properties'] = {
    'editor.defaultFormatter': {
        description: nls.localizeByDefault('Defines a default formatter which takes precedence over all other formatter settings. Must be the identifier of an extension contributing a formatter.'),
        type: ['string', 'null'],
        default: null,
    }
};
interface FormatActionsMultipleProperties {
    'editor.defaultFormatter': string | null;
}
// #endregion

// #region Custom Theia extensions to editor preferences

const theiaEditorSchema: PreferenceSchema['properties'] = {
    'editor.formatOnSaveTimeout': {
        'type': 'number',
        'default': 750,
        'description': nls.localize('theia/editor/formatOnSaveTimeout', 'Timeout in milliseconds after which the formatting that is run on file save is cancelled.')
    },
    'editor.history.persistClosedEditors': {
        'type': 'boolean',
        'default': false,
        'description': nls.localize('theia/editor/persistClosedEditors', 'Controls whether to persist closed editor history for the workspace across window reloads.')
    },
};

interface TheiaEditorProperties {
    'editor.formatOnSaveTimeout': number;
    'editor.history.persistClosedEditors': boolean;
}

// #endregion

const combinedProperties = {
    ...editorGeneratedPreferenceProperties,
    ...codeActionsContributionSchema,
    ...fileContributionSchema,
    ...formatActionsMultipleSchema,
    ...theiaEditorSchema
};

export const editorPreferenceSchema: PreferenceSchema = {
    'type': 'object',
    'scope': 'resource',
    'overridable': true,
    'properties': combinedProperties,
};

export interface EditorConfiguration extends GeneratedEditorPreferences,
    CodeActionsContributionProperties,
    FileContributionEditorPreferences,
    FormatActionsMultipleProperties,
    TheiaEditorProperties { }

export type EndOfLinePreference = '\n' | '\r\n' | 'auto';

export type EditorPreferenceChange = PreferenceChangeEvent<EditorConfiguration>;

export const EditorPreferenceContribution = Symbol('EditorPreferenceContribution');
export const EditorPreferences = Symbol('EditorPreferences');
export type EditorPreferences = PreferenceProxy<EditorConfiguration>;

/**
 * @deprecated @since 1.23.0
 *
 * By default, editor preferences now use a validated preference proxy created by the PreferenceProxyFactory binding.
 * This function will create an unvalidated preference proxy.
 * See {@link bindEditorPreferences}
 */
export function createEditorPreferences(preferences: PreferenceService, schema: PreferenceSchema = editorPreferenceSchema): EditorPreferences {
    return createPreferenceProxy(preferences, schema);
}

export function bindEditorPreferences(bind: interfaces.Bind): void {
    bind(EditorPreferences).toDynamicValue(ctx => {
        const factory = ctx.container.get<PreferenceProxyFactory>(PreferenceProxyFactory);
        return factory(editorPreferenceSchema);
    }).inSingletonScope();
    bind(EditorPreferenceContribution).toConstantValue({ schema: editorPreferenceSchema });
    bind(PreferenceContribution).toService(EditorPreferenceContribution);
}
