// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others
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
// @ts-check

const https = require('https');

/** The registry the packages are published to. */
const registry = (process.env.npm_config_registry || 'https://registry.npmjs.org/').replace(/\/+$/, '');

const agent = new https.Agent({ keepAlive: true, maxSockets: 10 });

/**
 * Asks the registry for a single version of a package.
 *
 * This deliberately does not shell out to `npm view`: that downloads the full packument and
 * caches it for the `max-age=300` the registry sends with it, so every lookup within five
 * minutes would be answered from the local cache with the same stale data. The per-version
 * endpoint used here is not cached.
 *
 * @param {string} name the package name, e.g. `@theia/core`
 * @param {string} version an exact version, e.g. `1.76.0`
 * @returns {Promise<string | undefined>} the published version, or `undefined` if the registry does not know it
 */
function fetchVersion(name, version) {
    const url = `${registry}/${name.replace('/', '%2f')}/${encodeURIComponent(version)}`;

    return new Promise((resolve, reject) => {
        const request = https.get(url, { agent, headers: { accept: 'application/json' } }, response => {
            const { statusCode } = response;
            let body = '';
            response.setEncoding('utf8');
            response.on('data', chunk => body += chunk);
            response.on('end', () => {
                if (statusCode === 404) {
                    resolve(undefined);
                } else if (statusCode !== 200) {
                    reject(new Error(`${url} responded with ${statusCode}`));
                } else {
                    try {
                        resolve(JSON.parse(body).version);
                    } catch (error) {
                        reject(new Error(`${url} responded with unparseable JSON: ${error.message}`));
                    }
                }
            });
        });
        request.setTimeout(30000, () => request.destroy(new Error(`${url} timed out`)));
        request.on('error', reject);
    });
}

module.exports = { fetchVersion };
