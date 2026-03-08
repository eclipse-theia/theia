// *****************************************************************************
// Copyright (C) 2020 Red Hat, Inc. and others.
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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { PluginIdentifiers, PluginModel, PluginPackage } from '../../../common/plugin-protocol';
import { localizeWithResolver } from '../../../common/package-nls-localize';
import { Endpoint } from '@theia/core/lib/browser/endpoint';
import { readResourceContent } from '@theia/core/lib/browser/resource-content-reader';
import URI from '@theia/core/lib/common/uri';

function getUri(pluginModel: PluginModel, relativePath: string): URI {
    const ownURI = new Endpoint().getRestUrl();
    return ownURI.parent.resolve(PluginPackage.toPluginUrl(pluginModel, relativePath));
}

async function readContents(uri: string): Promise<string> {
    try {
        return await readResourceContent(uri);
    } catch (e) {
        if (e && typeof (e as Error & { status?: number }).status === 'number' && (e as Error & { status?: number }).status === 404) {
            throw new Error('NotFound');
        }
        throw e;
    }
}

async function readPluginJson(pluginModel: PluginModel, relativePath: string): Promise<any> {
    const content = await readContents(getUri(pluginModel, relativePath).toString());
    const json = JSON.parse(content) as PluginPackage;
    json.publisher ??= PluginIdentifiers.UNPUBLISHED;
    return json;
}

/** Returns true if value contains any %key% localizable string placeholders. */
function hasLocalizableStrings(value: unknown): boolean {
    if (typeof value === 'string') {
        return value.length > 2 && value.startsWith('%') && value.endsWith('%');
    }
    if (Array.isArray(value)) {
        return value.some(item => hasLocalizableStrings(item));
    }
    if (typeof value === 'object' && value !== null) {
        return Object.values(value).some(item => hasLocalizableStrings(item));
    }
    return false;
}

export async function loadManifest(pluginModel: PluginModel): Promise<PluginPackage> {
    const manifest = await readPluginJson(pluginModel, 'package.json') as PluginPackage;
    // translate vscode builtins, as they are published with a prefix.
    const built_prefix = '@theia/vscode-builtin-';

    if (manifest.name && manifest.name.startsWith(built_prefix)) {
        manifest.name = manifest.name.substring(built_prefix.length);
    }

    // If package contains localizable strings, load the translations and localize the manifest
    if (hasLocalizableStrings(manifest)) {
        const translations = await loadTranslations(pluginModel);
        if (Object.keys(translations).length > 0) {
            return localizeWithResolver(manifest, key => translations[key]);
        }
    }

    return manifest;
}

async function loadTranslations(pluginModel: PluginModel): Promise<Record<string, string>> {
    try {
        return await readPluginJson(pluginModel, 'package.nls.json');
    } catch (e) {
        if (!(e instanceof Error && e.message === 'NotFound')) {
            throw e;
        }
        return {};
    }
}
