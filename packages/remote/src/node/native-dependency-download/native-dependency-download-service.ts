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

import { ContributionProvider } from '@theia/core';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { ApplicationPackage } from '@theia/core/shared/@theia/application-package';
import { DependencyDownloadContribution, DependencyDownloadService, DirectoryDependencyDownload, FileDependencyDownload } from '@theia/core/lib/node/dependency-download';
import { NodeRequestOptions, NodeRequestService } from '@theia/core/shared/@theia/request/lib/node-request-service';

const DEFAULT_HTTP_OPTIONS = {
    method: 'GET',
    headers: {
        Accept: 'application/octet-stream'
    },
};

@injectable()
export class NativeDependencyDownloadService implements DependencyDownloadService {

    @inject(ContributionProvider) @named(DependencyDownloadContribution.Contribution)
    protected dependencyDownloadContributions: ContributionProvider<DependencyDownloadContribution>;

    @inject(ApplicationPackage)
    protected applicationPackage: ApplicationPackage;

    @inject(NodeRequestService)
    protected nodeRequestService: NodeRequestService;

    async downloadDependencies(remoteOS: string): Promise<Array<FileDependencyDownload | DirectoryDependencyDownload>> {
        if (!this.applicationPackage.pck.version) {
            throw new Error('No Theia version found. Can\'t download dependencies');
        }
        return Promise.all(this.dependencyDownloadContributions.getContributions()
            .filter((contribution, index) => this.dependencyDownloadContributions.getContributions().findIndex(c => c.dependencyId === contribution.dependencyId) !== index)
            .map(async contribution =>
                contribution.download({
                    remoteOS,
                    theiaVersion: this.applicationPackage.pck.version!,
                    download: (requestInfo: string | NodeRequestOptions) => this.downloadDependency(requestInfo)
                })
            ));
    }

    protected async downloadDependency(downloadURI: string | NodeRequestOptions): Promise<Buffer> {
        const req = await this.nodeRequestService.request(typeof downloadURI === 'string' ? { url: downloadURI, ...DEFAULT_HTTP_OPTIONS } : downloadURI);
        if (!req.res.statusCode || req.res.statusCode >= 400) {
            throw new Error('Server error while downloading nativ dependency');
        } else if (req.res.statusCode >= 300 && req.res.statusCode < 400) {
            return this.downloadDependency(req.res.headers.location!);
        } else {
            return Buffer.from(req.buffer);
        }
    }
}
