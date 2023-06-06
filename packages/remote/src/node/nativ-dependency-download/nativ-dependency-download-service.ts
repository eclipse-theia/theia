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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { ContributionProvider, URI } from '@theia/core';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { DependencyDownloadContribution, dependencyDownloadContribution, DependencyDownloadService } from '@theia/core/lib/node/dependency-download';
import { createWriteStream } from 'fs';
import { request } from 'https'
import { RequestOptions } from 'https';
import * as path from 'path'
import temp = require('temp');
import * as decompress from 'decompress'

const DEFAULT_HTTP_OPTIONS: RequestOptions = {
    method: 'GET',
    headers: {
        Accept: 'application/octet-stream'
    },
}

@injectable()
export class NativeDependencyDownloadService implements DependencyDownloadService {

    @inject(ContributionProvider) @named(dependencyDownloadContribution)
    protected dependencyDownloadContributions: ContributionProvider<DependencyDownloadContribution>;

    async downloadDependencies(remoteOS: string): Promise<string> {
        const tmpDir = temp.mkdirSync(`theia-native-dependencies-${remoteOS}`);
        const unpackDir = path.join(tmpDir, 'unpacked')
        await Promise.all(this.dependencyDownloadContributions.getContributions()
            .map(async contribution => {
                const file = await this.downloadDependency(await contribution.getDownloadUrl(remoteOS), tmpDir, contribution.httpOptions);
                await this.unpackDependency(file, unpackDir);
            }));
        return unpackDir
    }

    protected async downloadDependency(downloadURI: string, destinationPath: string, httpOptions?: RequestOptions, fileName?: string): Promise<string> {

        return new Promise(async (resolve, reject) => {
            const req = request(downloadURI, httpOptions ?? DEFAULT_HTTP_OPTIONS, async res => {
                const uri = new URI(downloadURI);
                if (!res.statusCode || res.statusCode >= 400) {
                    reject('Server error while downloading nativ dependency')
                } else if (res.statusCode >= 300 && res.statusCode < 400) {
                    const destinationFile = await this.downloadDependency(res.headers.location!, destinationPath, httpOptions, uri.path.name);
                    resolve(destinationFile);
                } else {
                    const destinationFile = path.join(destinationPath, fileName ?? uri.path.name)
                    const fileStream = createWriteStream(destinationFile, { flags: 'w', autoClose: true });
                    res.pipe(fileStream);
                    res.on('error', err => reject(err));
                    res.on('close', () => resolve(destinationFile));
                }
            });
            req.end()
        });
    }

    protected async unpackDependency(file: string, destinationDir: string) {
        await decompress(file, destinationDir);
    }
}
