// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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
import { createPreferenceProxy, PreferenceProxy, PreferenceService, PreferenceContribution, PreferenceSchema } from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common/nls';

/* eslint-disable max-len */

export const GitConfigSchema: PreferenceSchema = {
    'type': 'object',
    'properties': {
        'git.decorations.enabled': {
            'type': 'boolean',
            'description': nls.localize('vscode.git/package/config.decorations.enabled', 'Show Git file status in the navigator.'),
            'default': true
        },
        'git.decorations.colors': {
            'type': 'boolean',
            'description': nls.localize('theia/git/gitDecorationsColors', 'Use color decoration in the navigator.'),
            'default': true
        },
        'git.editor.decorations.enabled': {
            'type': 'boolean',
            'description': nls.localize('theia/git/editorDecorationsEnabled', 'Show git decorations in the editor.'),
            'default': true
        },
        'git.editor.dirtyDiff.linesLimit': {
            'type': 'number',
            'description': nls.localize('theia/git/dirtyDiffLinesLimit', 'Do not show dirty diff decorations, if editor\'s line count exceeds this limit.'),
            'default': 1000
        },
        'git.alwaysSignOff': {
            'type': 'boolean',
            'description': nls.localize('vscode.git/package/config.alwaysSignOff', 'Always sign off commits.'),
            'default': false
        },
        'git.untrackedChanges': {
            type: 'string',
            enum: [
                nls.localize('theia/scm/config.untrackedChanges.mixed', 'mixed'),
                nls.localize('theia/scm/config.untrackedChanges.separate', 'separate'),
                nls.localize('theia/scm/config.untrackedChanges.hidden', 'hidden')
            ],
            enumDescriptions: [
                nls.localize('theia/scm/config.untrackedChanges.mixed/description', 'All changes, tracked and untracked, appear together and behave equally.'),
                nls.localize('theia/scm/config.untrackedChanges.separate/description', 'Untracked changes appear separately in the Source Control view. They are also excluded from several actions.'),
                nls.localize('theia/scm/config.untrackedChanges.hidden/description', 'Untracked changes are hidden and excluded from several actions.'),
            ],
            description: nls.localize('theia/scm/config.untrackedChanges', 'Controls how untracked changes behave.'),
            default: 'mixed',
            scope: 'resource',
        }
    }
};

export interface GitConfiguration {
    'git.decorations.enabled': boolean,
    'git.decorations.colors': boolean,
    'git.editor.decorations.enabled': boolean,
    'git.editor.dirtyDiff.linesLimit': number,
    'git.alwaysSignOff': boolean,
    'git.untrackedChanges': 'mixed' | 'separate' | 'hidden';
}

export const GitPreferenceContribution = Symbol('GitPreferenceContribution');
export const GitPreferences = Symbol('GitPreferences');
export type GitPreferences = PreferenceProxy<GitConfiguration>;

export function createGitPreferences(preferences: PreferenceService, schema: PreferenceSchema = GitConfigSchema): GitPreferences {
    return createPreferenceProxy(preferences, schema);
}

export function bindGitPreferences(bind: interfaces.Bind): void {
    bind(GitPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        const contribution = ctx.container.get<PreferenceContribution>(GitPreferenceContribution);
        return createGitPreferences(preferences, contribution.schema);
    }).inSingletonScope();
    bind(GitPreferenceContribution).toConstantValue({ schema: GitConfigSchema });
    bind(PreferenceContribution).toService(GitPreferenceContribution);
}
