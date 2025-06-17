// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { nls } from '@theia/core';
import { PreferenceSchema } from '@theia/core/lib/browser/preferences/preference-contribution';

export const CONSIDER_GITIGNORE_PREF = 'ai-features.workspaceFunctions.considerGitIgnore';
export const USER_EXCLUDE_PATTERN_PREF = 'ai-features.workspaceFunctions.userExcludes';
export const SEARCH_IN_WORKSPACE_MAX_RESULTS_PREF = 'ai-features.workspaceFunctions.searchMaxResults';
export const PROMPT_TEMPLATE_WORKSPACE_DIRECTORIES_PREF = 'ai-features.promptTemplates.WorkspaceTemplateDirectories';
export const PROMPT_TEMPLATE_ADDITIONAL_EXTENSIONS_PREF = 'ai-features.promptTemplates.TemplateExtensions';
export const PROMPT_TEMPLATE_WORKSPACE_FILES_PREF = 'ai-features.promptTemplates.WorkspaceTemplateFiles';
export const TASK_CONTEXT_STORAGE_DIRECTORY_PREF = 'ai-features.promptTemplates.taskContextStorageDirectory';

const CONFLICT_RESOLUTION_DESCRIPTION = 'When templates with the same ID (filename) exist in multiple locations, conflicts are resolved by priority: specific template files \
(highest) > workspace directories > global directories (lowest).';

export const WorkspacePreferencesSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        [CONSIDER_GITIGNORE_PREF]: {
            type: 'boolean',
            title: nls.localize('theia/ai/workspace/considerGitignore/title', 'Consider .gitignore'),
            description: nls.localize('theia/ai/workspace/considerGitignore/description',
                'If enabled, excludes files/folders specified in a global .gitignore file (expected location is the workspace root).'),
            default: false
        },
        [USER_EXCLUDE_PATTERN_PREF]: {
            type: 'array',
            title: nls.localize('theia/ai/workspace/excludedPattern/title', 'Excluded File Patterns'),
            description: nls.localize('theia/ai/workspace/excludedPattern/description', 'List of patterns (glob or regex) for files/folders to exclude.'),
            default: ['node_modules', 'lib', '.*'],
            items: {
                type: 'string'
            }
        },
        [SEARCH_IN_WORKSPACE_MAX_RESULTS_PREF]: {
            type: 'number',
            title: nls.localize('theia/ai/workspace/searchMaxResults/title', 'Maximum Search Results'),
            description: nls.localize('theia/ai/workspace/searchMaxResults/description',
                'Maximum number of search results returned by the workspace search function.'),
            default: 30,
            minimum: 1
        },
        [PROMPT_TEMPLATE_WORKSPACE_DIRECTORIES_PREF]: {
            type: 'array',
            title: nls.localize('theia/ai/promptTemplates/directories/title', 'Workspace-specific Prompt Template Directories'),
            description: nls.localize('theia/ai/promptTemplates/directories/description',
                'List of relative paths indicating folders in the current workspace to be scanned for WORKSPACE specific prompt templates. ' +
                CONFLICT_RESOLUTION_DESCRIPTION),
            default: ['.prompts'],
            items: {
                type: 'string'
            }
        },
        [PROMPT_TEMPLATE_ADDITIONAL_EXTENSIONS_PREF]: {
            type: 'array',
            title: nls.localize('theia/ai/promptTemplates/extensions/title', 'Additional Prompt Template File Extensions'),
            description: nls.localize('theia/ai/promptTemplates/extensions/description',
                'List of additional file extensions in prompt locations that are considered as prompt templates. \'.prompttemplate\' is always considered as a default.'),
            items: {
                type: 'string'
            }
        },
        [PROMPT_TEMPLATE_WORKSPACE_FILES_PREF]: {
            type: 'array',
            title: nls.localize('theia/ai/promptTemplates/files/title', 'Workspace-specific Prompt Template Files'),
            description: nls.localize('theia/ai/promptTemplates/files/description',
                'List of relative paths to specific files in the current workspace to be used as prompt templates. ' +
                CONFLICT_RESOLUTION_DESCRIPTION),
            default: [],
            items: {
                type: 'string'
            }
        },
        [TASK_CONTEXT_STORAGE_DIRECTORY_PREF]: {
            type: 'string',
            description: nls.localize('theia/ai/chat/taskContextStorageDirectory/description',
                'A workspace relative path in which to persist and from which to retrieve task context descriptions.' +
                ' If set to empty value, generated task contexts will be stored in memory rather than on disk.'
            ),
            default: '.prompts/task-contexts'
        }
    }
};
