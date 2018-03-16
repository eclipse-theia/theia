/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { interfaces } from 'inversify';
import { createPreferenceProxy, PreferenceProxy, PreferenceService, PreferenceContribution, PreferenceSchema } from '@theia/core/lib/browser';

export const GitConfigSchema: PreferenceSchema = {
    'type': 'object',
    'properties': {
        'git.decorations.enabled': {
            'type': 'boolean',
            'description': 'Show Git file status in the navigator.',
            'default': true
        },
        'git.decorations.colors': {
            'type': 'boolean',
            'description': 'Use color decoration in the navigator.',
            'default': false
        },
        'git.editor.decorations.enabled': {
            'type': 'boolean',
            'description': 'Show git decorations in the editor.',
            'default': true
        },
        'git.editor.dirtydiff.linesLimit': {
            'type': 'number',
            'description': 'Do not show dirty diff decorations, if editor\'s line count exceeds this limit.',
            'default': 1000
        }
    }
};

export interface GitConfiguration {
    'git.decorations.enabled': boolean,
    'git.decorations.colors': boolean,
    'git.editor.decorations.enabled': boolean,
    'git.editor.dirtydiff.linesLimit': number,
}

export const GitPreferences = Symbol('GitPreferences');
export type GitPreferences = PreferenceProxy<GitConfiguration>;

export function createGitPreferences(preferences: PreferenceService): GitPreferences {
    return createPreferenceProxy(preferences, GitConfigSchema);
}

export function bindGitPreferences(bind: interfaces.Bind): void {
    bind(GitPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        return createGitPreferences(preferences);
    });
    bind(PreferenceContribution).toConstantValue({ schema: GitConfigSchema });
}
