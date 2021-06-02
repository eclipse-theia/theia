/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable } from '@theia/core/shared/inversify';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as request from 'request';
import { PluginDeployerResolver, PluginDeployerResolverContext } from '../../common';

/**
 * Resolver that handle the github: protocol
 * github:<org>/<repo>/<filename>@latest
 * github:<org>/<repo>/<filename>@<version>
 */
@injectable()
export class GithubPluginDeployerResolver implements PluginDeployerResolver {

    private static PREFIX = 'github:';

    private static GITHUB_ENDPOINT = 'https://github.com/';

    private unpackedFolder: string;

    constructor() {
        this.unpackedFolder = path.resolve(os.tmpdir(), 'github-remote');
        if (!fs.existsSync(this.unpackedFolder)) {
            fs.mkdirSync(this.unpackedFolder);
        }
    }

    /**
     * Grab the remote file specified by Github URL
     */
    async resolve(pluginResolverContext: PluginDeployerResolverContext): Promise<void> {

        // download the file
        return new Promise<void>((resolve, reject) => {
            // extract data
            const extracted = /^github:(.*)\/(.*)\/(.*)$/gm.exec(pluginResolverContext.getOriginId());
            if (!extracted || extracted === null || extracted.length !== 4) {
                reject(new Error('Invalid extension' + pluginResolverContext.getOriginId()));
                return;
            }

            const orgName = extracted[1];
            const repoName = extracted[2];
            const file = extracted[3];

            // get version if any
            const splitFile = file.split('@');
            let version;
            let filename: string;
            if (splitFile.length === 1) {
                filename = file;
                version = 'latest';
            } else {
                filename = splitFile[0];
                version = splitFile[1];
            }
            // latest version, need to get the redirect
            const url = GithubPluginDeployerResolver.GITHUB_ENDPOINT + orgName + '/' + repoName + '/releases/latest';

            // disable redirect to grab the release
            const options = {
                followRedirect: false
            };
            // if latest, resolve first the real version
            if (version === 'latest') {
                request.get(url, options).on('response', response => {

                    // should have a redirect
                    if (response.statusCode === 302) {
                        const redirectLocation = response.headers.location;
                        if (!redirectLocation) {
                            reject(new Error('Invalid github link with latest not being found'));
                            return;
                        }

                        // parse redirect link
                        const taggedValueArray = /^https:\/\/.*tag\/(.*)/gm.exec(redirectLocation);
                        if (!taggedValueArray || taggedValueArray.length !== 2) {
                            reject(new Error('The redirect link for latest is invalid ' + redirectLocation));
                            return;
                        }

                        // grab version of tag
                        this.grabGithubFile(pluginResolverContext, orgName, repoName, filename, taggedValueArray[1], resolve, reject);

                    }
                });
            } else {
                this.grabGithubFile(pluginResolverContext, orgName, repoName, filename, version, resolve, reject);
            }

        });

    }

    /*
     * Grab the github file specified by the plugin's ID
     */
    protected grabGithubFile(pluginResolverContext: PluginDeployerResolverContext, orgName: string, repoName: string, filename: string, version: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolve: (value?: void | PromiseLike<void>) => void, reject: (reason?: any) => void): void {

        const unpackedPath = path.resolve(this.unpackedFolder, path.basename(version + filename));
        const finish = () => {
            pluginResolverContext.addPlugin(pluginResolverContext.getOriginId(), unpackedPath);
            resolve();
        };

        // use of cache. If file is already there use it directly
        if (fs.existsSync(unpackedPath)) {
            finish();
            return;
        }
        const dest = fs.createWriteStream(unpackedPath);

        dest.addListener('finish', finish);
        const url = GithubPluginDeployerResolver.GITHUB_ENDPOINT + orgName + '/' + repoName + '/releases/download/' + version + '/' + filename;
        request.get(url)
            .on('error', err => {
                reject(err);
            }).pipe(dest);

    }

    /**
     * Handle only the plugins that starts with github:
     */
    accept(pluginId: string): boolean {
        return pluginId.startsWith(GithubPluginDeployerResolver.PREFIX);
    }
}
