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

import { PluginModel, PluginPackage } from '../../../common/plugin-protocol';
import { Endpoint } from '@theia/core/lib/browser/endpoint';
import URI from '@theia/core/lib/common/uri';
import { localizeWithResolver } from '@theia/plugin-utils/lib/package-nls';
import { prepareLoadedManifest } from '@theia/plugin-utils/lib/plugin-manifest';

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
    return JSON.parse(content);
}

export async function loadManifest(pluginModel: PluginModel): Promise<any> {
    const [manifest, translations] = await Promise.all([
        readPluginJson(pluginModel, 'package.json').then(raw =>
            prepareLoadedManifest(raw as PluginPackage, { updateActivationEvents: false })
        ),
        loadTranslations(pluginModel)
    ]);
    return manifest && translations && Object.keys(translations).length ?
        localizeWithResolver(manifest, key => translations[key]) :
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
