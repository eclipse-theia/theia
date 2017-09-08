/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { interfaces } from 'inversify';
import { createPreferenceProxy, PreferenceProxy, PreferenceService } from '@theia/preferences-api';
import { PreferenceSchema } from '@theia/preferences-api/lib/common/';

export interface GitConfiguration {

    /**
     * The time-interval (in milliseconds) to poll for the status changes in the local working directory.
     */
    'git.pollInterval': number

}

const DefaultGitConfiguration: GitConfiguration = {
    'git.pollInterval': 1000
};

export const GitPreferenceSchema: PreferenceSchema = {
    'type': 'object',
    'properties': {
        'git.pollInterval': {
            'type': 'number',
            'minimum': 100,
            'description': 'The time-interval (in milliseconds) to poll for the status changes in the local working directory.'
        }
    }
};

export const GitPreferences = Symbol('GitPreferences');
export type GitPreferences = PreferenceProxy<GitConfiguration>;

function createGitPreferences(preferences: PreferenceService): GitPreferences {
    return createPreferenceProxy(preferences, DefaultGitConfiguration, GitPreferenceSchema);
}

export function bindGitPreferences(bind: interfaces.Bind): void {
    bind(GitPreferences).toDynamicValue(context => createGitPreferences(context.container.get(PreferenceService)));
}
