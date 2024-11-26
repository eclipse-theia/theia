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

import { PreferenceSchema } from '@theia/core/lib/browser/preferences/preference-contribution';

export const CONSIDER_GITIGNORE_PREF = 'ai-features.workspaceFunctions.considerGitIgnore';
export const USER_EXCLUDE_PATTERN_PREF = 'ai-features.workspaceFunctions.userExcludes';

export const WorkspacePreferencesSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        [CONSIDER_GITIGNORE_PREF]: {
            type: 'boolean',
            title: 'Consider .gitignore',
            description: 'If enabled, excludes files/folders specified in a global .gitignore file (expected location is the workspace root).',
            default: false
        },
        [USER_EXCLUDE_PATTERN_PREF]: {
            type: 'array',
            title: 'Excluded File Patterns',
            description: 'List of patterns (glob or regex) for files/folders to exclude.',
            default: ['node_modules', 'lib', '.*'],
            items: {
                type: 'string'
            }
        }
    }
};
