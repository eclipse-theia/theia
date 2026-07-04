// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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

import { flatten, isObject, isStringArray } from './local-utils';
import { rawContributes, type PluginManifest } from './manifest-types';

/**
 * Most activation events can be automatically deduced from the package manifest.
 * This function will update the manifest based on the plugin contributions.
 */
export function updateActivationEvents(manifest: Pick<PluginManifest, 'contributes' | 'activationEvents'>): void {
    if (!isObject(manifest) || !isObject(manifest.contributes) || !manifest.contributes) {
        return;
    }

    const activationEvents = new Set(isStringArray(manifest.activationEvents) ? manifest.activationEvents : []);
    const contributes = rawContributes(manifest);

    if (contributes.commands) {
        const commands = Array.isArray(contributes.commands) ? contributes.commands : [contributes.commands];
        updateCommandsContributions(commands, activationEvents);
    }
    if (isObject(contributes.views) && !Array.isArray(contributes.views)) {
        const views = flatten(Object.values(contributes.views));
        updateViewsContribution(views, activationEvents);
    }
    if (Array.isArray(contributes.customEditors)) {
        updateCustomEditorsContribution(contributes.customEditors, activationEvents);
    }
    if (Array.isArray(contributes.authentication)) {
        updateAuthenticationProviderContributions(contributes.authentication, activationEvents);
    }
    if (Array.isArray(contributes.languages)) {
        updateLanguageContributions(contributes.languages, activationEvents);
    }
    if (Array.isArray(contributes.notebooks)) {
        updateNotebookContributions(contributes.notebooks, activationEvents);
    }

    manifest.activationEvents = Array.from(activationEvents);
}

function updateViewsContribution(views: unknown[], activationEvents: Set<string>): void {
    for (const view of views) {
        if (isObject(view) && typeof view.id === 'string') {
            activationEvents.add(`onView:${view.id}`);
        }
    }
}

function updateCustomEditorsContribution(customEditors: unknown[], activationEvents: Set<string>): void {
    for (const customEditor of customEditors) {
        if (isObject(customEditor) && typeof customEditor.viewType === 'string') {
            activationEvents.add(`onCustomEditor:${customEditor.viewType}`);
        }
    }
}

function updateCommandsContributions(commands: unknown[], activationEvents: Set<string>): void {
    for (const command of commands) {
        if (isObject(command) && typeof command.command === 'string') {
            activationEvents.add(`onCommand:${command.command}`);
        }
    }
}

function updateAuthenticationProviderContributions(authProviders: unknown[], activationEvents: Set<string>): void {
    for (const authProvider of authProviders) {
        if (isObject(authProvider) && typeof authProvider.id === 'string') {
            activationEvents.add(`onAuthenticationRequest:${authProvider.id}`);
        }
    }
}

function updateLanguageContributions(languages: unknown[], activationEvents: Set<string>): void {
    for (const language of languages) {
        if (isObject(language) && typeof language.id === 'string') {
            activationEvents.add(`onLanguage:${language.id}`);
        }
    }
}

function updateNotebookContributions(notebooks: unknown[], activationEvents: Set<string>): void {
    for (const notebook of notebooks) {
        if (isObject(notebook) && typeof notebook.type === 'string') {
            activationEvents.add(`onNotebookSerializer:${notebook.type}`);
        }
    }
}
