/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { interfaces } from 'inversify';
import { createPreferenceProxy, PreferenceProxy, PreferenceService, PreferenceContribution, PreferenceSchema } from '@theia/core/lib/browser';

export const GitDecorationsConfigSchema: PreferenceSchema = {
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
    }
};

export interface GitDecorationsConfiguration {
    'git.decorations.enabled': boolean,
    'git.decorations.colors': boolean
}

export const GitDecorationsPreferences = Symbol('GitDecorationsPreferences');
export type GitDecorationsPreferences = PreferenceProxy<GitDecorationsConfiguration>;

export function createGitDecorationsPreferences(preferences: PreferenceService): GitDecorationsPreferences {
    return createPreferenceProxy(preferences, GitDecorationsConfigSchema);
}

export function bindGitDecorationsPreferences(bind: interfaces.Bind): void {
    bind(GitDecorationsPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        return createGitDecorationsPreferences(preferences);
    });
    bind(PreferenceContribution).toConstantValue({ schema: GitDecorationsConfigSchema });
}
