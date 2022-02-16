/********************************************************************************
 * Copyright (C) 2022 Ericsson and others.
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

import { environment, nls } from '@theia/core';
import { PreferenceDataSchema, PreferenceSchema, PreferenceScope } from '@theia/core/lib/browser';
import { EditorOptions, IDiffEditorBaseOptions, IEditorOptions } from 'monaco-editor-core/esm/vs/editor/common/config/editorOptions';
import { Extensions, IConfigurationRegistry } from 'monaco-editor-core/esm/vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'monaco-editor-core/esm/vs/platform/registry/common/platform';
/* eslint-disable max-len,no-null/no-null */

/**
 * Wrangling all the editor preferences from Monaco is a pain. There's some good stuff in src/vs/editor/common/config/editorOptions.ts
 * That registers and types most of the core editor preferences. However, other preferences are registered in other places.
 * The most work is done in src/vs/editor/common/config/editorConfigurationSchema.ts, and that file defines
 * 'editorConfigurationBaseNode', which is used in other places where editor preferences are registered. Searching for that should
 * turn up most options.
 */

// #region Available from src/vs/editor/common/config/editorOptions.ts
type CoreEditorOptions = {
    [Property in keyof IEditorOptions as `editor.${Property}`]: IEditorOptions[Property]
};

type CoreDiffEditorOptions = {
    [Property in keyof IDiffEditorBaseOptions as `diffEditor.${Property}`]: IDiffEditorBaseOptions[Property]
};
// #endregion

// #region Other entries already registered with the Monaco ConfigurationService: We don't have to copy the schema.

// #region src/vs/editor/common/config/editorConfigurationSchema.ts
/** Omitted the properties that conflict with {@link IDiffEditorBaseOptions} */
interface EditorConfigurationProperties {
    'editor.tabSize': number;
    'editor.insertSpaces': boolean,
    'editor.detectIndentation': boolean,
    'editor.trimAutoWhitespace': boolean,
    'editor.largeFileOptimizations': boolean,
    'editor.wordBasedSuggestions': boolean,
    'editor.wordBasedSuggestionsMode': 'currentDocument' | 'matchingDocuments' | 'allDocuments',
    'editor.semanticHighlighting.enabled': true | false | 'configuredByTheme';
    'editor.stablePeek': boolean;
    'editor.maxTokenizationLineLength': number;
    'editor.language.brackets': Array<[string, string]> | false;
    'editor.language.colorizedBracketPairs': Array<[string, string]> | false;
    'diffEditor.codeLens': boolean;
    'diffEditor.wordWrap': 'off' | 'on' | 'inherit';
}
// #endregion

// #region src/vs/workbench/contrib/codeActions/browser/codeActionsContribution.ts

interface CodeActionsContributionProperties {
    'editor.codeActionsOnSave': string[] | ({ 'source.fixAll': boolean } & { [Key: string]: boolean | undefined })
}

// #endregion

// #endregion

// #region Other editor preferences: we do have to copy these schemas, because they are outside of `monaco-editor-core`, so the schemas are not already registered.

// #region src/vs/workbench/contrib/files/browser/files.contribution.ts
const fileContributionEditorPreferenceProperties: PreferenceDataSchema['properties'] = {
    'editor.formatOnSave': {
        'type': 'boolean',
        'description': nls.localizeByDefault('Format a file on save. A formatter must be available, the file must not be saved after delay, and the editor must not be shutting down.'),
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
    // Include this, even though it is not strictly an `editor`preference. TODO: Why have we done it this way?
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
        'description': nls.localizeByDefault('eol', 'The default end of line character.'),
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
        'markdownDescription': nls.localizeByDefault('Controls [auto save](https://code.visualstudio.com/docs/editor/codebasics#_save-auto-save) of editors that have unsaved changes.', 'off', 'afterDelay', 'onFocusChange', 'onWindowChange', 'afterDelay')
    },
    'files.autoSaveDelay': {
        'type': 'number',
        'default': 1000,
        'minimum': 0,
        'markdownDescription': nls.localizeByDefault('Controls the delay in milliseconds after which an editor with unsaved changes is saved automatically. Only applies when `#files.autoSave#` is set to `{0}`.', 'afterDelay')
    },
};

interface FileContributionEditorPreferences {
    'editor.formatOnSave': boolean;
    'editor.formatOnSaveMode': 'file' | 'modifications' | 'modificationsIfAvailable';
    'files.eol': '\n' | '\r\n' | 'auto';
    'files.autoSave': 'off' | 'afterDelay' | 'onFocusChange' | 'onWindowChange';
    'files.autoSaveDelay': number;
}
// #endregion

// #region src/vs/workbench/contrib/format/browser/formatActionsMultiple.ts
// This schema depends on a lot of private stuff in the file, so this is a stripped down version.
const formatActionsMultiplePreferenceProperties: PreferenceDataSchema['properties'] = {
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

const theiaEditorPreferenceProperties: PreferenceDataSchema['properties'] = {
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
// #region Creating the full schema and interface

export const monacoEditorPreferenceSchema: PreferenceSchema = {
    type: 'object',
    overridable: true,
    properties: {
        ...fileContributionEditorPreferenceProperties,
        ...formatActionsMultiplePreferenceProperties,
        ...theiaEditorPreferenceProperties,
    }
};
console.log('SENTINEL FOR WHERE WE START', monacoEditorPreferenceSchema);

Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurations().forEach(config => {
    if (config.id === 'editor' && config.properties) {
        console.log('SENTINEL FOR A CONFIG WITH RELEVANT STUFF', config);
        Object.assign(monacoEditorPreferenceSchema.properties, config.properties);
    }
});

for (const key of Object.keys(EditorOptions)) {
    const label = `editor.${key}`;
    if (!(label in monacoEditorPreferenceSchema.properties)) {
        monacoEditorPreferenceSchema.properties[label] = { userVisible: false };
    }
}

export interface MonacoEditorOptions extends CoreEditorOptions,
    CoreDiffEditorOptions,
    EditorConfigurationProperties,
    CodeActionsContributionProperties,
    FileContributionEditorPreferences,
    FormatActionsMultipleProperties,
    TheiaEditorProperties { }

// #endregion
