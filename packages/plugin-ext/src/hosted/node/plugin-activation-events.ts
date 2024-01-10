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

import { flatten } from '../../common/arrays';
import { isStringArray, isObject } from '@theia/core/lib/common/types';
import {
    PluginPackage,
    PluginPackageAuthenticationProvider,
    PluginPackageCommand,
    PluginPackageContribution,
    PluginPackageCustomEditor,
    PluginPackageLanguageContribution,
    PluginPackageNotebook,
    PluginPackageView
} from '../../common/plugin-protocol';

/**
 * Most activation events can be automatically deduced from the package manifest.
 * This function will update the manifest based on the plugin contributions.
 */
export function updateActivationEvents(manifest: PluginPackage): void {
    if (!isObject<PluginPackage>(manifest) || !isObject<PluginPackageContribution>(manifest.contributes) || !manifest.contributes) {
        return;
    }

    const activationEvents = new Set(isStringArray(manifest.activationEvents) ? manifest.activationEvents : []);

    if (manifest.contributes.commands) {
        const value = manifest.contributes.commands;
        const commands = Array.isArray(value) ? value : [value];
        updateCommandsContributions(commands, activationEvents);
    }
    if (isObject(manifest.contributes.views)) {
        const views = flatten(Object.values(manifest.contributes.views));
        updateViewsContribution(views, activationEvents);
    }
    if (Array.isArray(manifest.contributes.customEditors)) {
        updateCustomEditorsContribution(manifest.contributes.customEditors, activationEvents);
    }
    if (Array.isArray(manifest.contributes.authentication)) {
        updateAuthenticationProviderContributions(manifest.contributes.authentication, activationEvents);
    }
    if (Array.isArray(manifest.contributes.languages)) {
        updateLanguageContributions(manifest.contributes.languages, activationEvents);
    }
    if (Array.isArray(manifest.contributes.notebooks)) {
        updateNotebookContributions(manifest.contributes.notebooks, activationEvents);
    }

    manifest.activationEvents = Array.from(activationEvents);
}

function updateViewsContribution(views: PluginPackageView[], activationEvents: Set<string>): void {
    for (const view of views) {
        if (isObject<PluginPackageView>(view) && typeof view.id === 'string') {
            activationEvents.add(`onView:${view.id}`);
        }
    }
}

function updateCustomEditorsContribution(customEditors: PluginPackageCustomEditor[], activationEvents: Set<string>): void {
    for (const customEditor of customEditors) {
        if (isObject<PluginPackageCustomEditor>(customEditor) && typeof customEditor.viewType === 'string') {
            activationEvents.add(`onCustomEditor:${customEditor.viewType}`);
        }
    }
}

function updateCommandsContributions(commands: PluginPackageCommand[], activationEvents: Set<string>): void {
    for (const command of commands) {
        if (isObject<PluginPackageCommand>(command) && typeof command.command === 'string') {
            activationEvents.add(`onCommand:${command.command}`);
        }
    }
}

function updateAuthenticationProviderContributions(authProviders: PluginPackageAuthenticationProvider[], activationEvents: Set<string>): void {
    for (const authProvider of authProviders) {
        if (isObject<PluginPackageAuthenticationProvider>(authProvider) && typeof authProvider.id === 'string') {
            activationEvents.add(`onAuthenticationRequest:${authProvider.id}`);
        }
    }
}

function updateLanguageContributions(languages: PluginPackageLanguageContribution[], activationEvents: Set<string>): void {
    for (const language of languages) {
        if (isObject<PluginPackageLanguageContribution>(language) && typeof language.id === 'string') {
            activationEvents.add(`onLanguage:${language.id}`);
        }
    }
}

function updateNotebookContributions(notebooks: PluginPackageNotebook[], activationEvents: Set<string>): void {
    for (const notebook of notebooks) {
        if (isObject<PluginPackageNotebook>(notebook) && typeof notebook.type === 'string') {
            activationEvents.add(`onNotebookSerializer:${notebook.type}`);
        }
    }
}
