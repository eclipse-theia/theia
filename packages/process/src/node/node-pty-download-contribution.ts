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

import { DependencyDownloadContribution, DirectoryDependencyDownload, DownloadOptions, FileDependencyDownload } from '@theia/core/lib/node/dependency-download';
import { injectable } from '@theia/core/shared/inversify';

@injectable()
export class NodePtyDependencyDownload implements DependencyDownloadContribution {
    dependencyId = 'node-pty';

    async download(options: DownloadOptions): Promise<FileDependencyDownload | DirectoryDependencyDownload> {
        return {
            files: path => ({
                targetFile: path.endsWith('pty.node') ? 'lib/backend/native/pty.node' : 'lib/build/Release/spawn-helper'
            }),
            downloadHandler: await options.download(DependencyDownloadContribution.getDefaultURLForFile('node-pty', options.remoteOS, options.theiaVersion))
        };
    }
}
