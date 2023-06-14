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
import { Endpoint } from '@theia/core/lib/browser/endpoint';
import URI from '@theia/core/lib/common/uri';

const NLS_REGEX = /^%([\w\d.-]+)%$/i;

function getUri(pluginModel: PluginModel, relativePath: string): URI {
    const ownURI = new Endpoint().getRestUrl();
    return ownURI.parent.resolve(PluginPackage.toPluginUrl(pluginModel, relativePath));
}

function readPluginFile(pluginModel: PluginModel, relativePath: string): Promise<string> {
    return readContents(getUri(pluginModel, relativePath).toString());
}

function readContents(uri: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();

        request.onreadystatechange = function (): void {
            if (this.readyState === XMLHttpRequest.DONE) {
                if (this.status === 200) {
                    resolve(this.response);
                } else if (this.status === 404) {
                    reject('NotFound');
                } else {
                    reject(new Error('Could not fetch plugin resource'));
                }
            }
        };

        request.open('GET', uri, true);
        request.send();
    });
}

async function readPluginJson(pluginModel: PluginModel, relativePath: string): Promise<any> {
    const content = await readPluginFile(pluginModel, relativePath);
    const json = JSON.parse(content) as PluginPackage;
    json.publisher ??= PluginIdentifiers.UNPUBLISHED;
    return json;
}

export async function loadManifest(pluginModel: PluginModel): Promise<any> {
    const [manifest, translations] = await Promise.all([
        readPluginJson(pluginModel, 'package.json'),
        loadTranslations(pluginModel)
    ]);
    // translate vscode builtins, as they are published with a prefix.
    const built_prefix = '@theia/vscode-builtin-';
    if (manifest && manifest.name && manifest.name.startsWith(built_prefix)) {
        manifest.name = manifest.name.substring(built_prefix.length);
    }
    return manifest && translations && Object.keys(translations).length ?
        localize(manifest, translations) :
        manifest;
}

async function loadTranslations(pluginModel: PluginModel): Promise<any> {
    try {
        return await readPluginJson(pluginModel, 'package.nls.json');
    } catch (e) {
        if (e !== 'NotFound') {
            throw e;
        }
        return {};
    }
}

function localize(value: any, translations: {
    [key: string]: string
}): any {
    if (typeof value === 'string') {
        const match = NLS_REGEX.exec(value);
        return match && translations[match[1]] || value;
    }
    if (Array.isArray(value)) {
        const result = [];
        for (const item of value) {
            result.push(localize(item, translations));
        }
        return result;
    }
    if (value === null) {
        return value;
    }
    if (typeof value === 'object') {
        const result: { [key: string]: any } = {};
        // eslint-disable-next-line guard-for-in
        for (const propertyName in value) {
            result[propertyName] = localize(value[propertyName], translations);
        }
        return result;
    }
    return value;
}
