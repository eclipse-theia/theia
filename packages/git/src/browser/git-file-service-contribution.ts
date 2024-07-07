// *****************************************************************************
// Copyright (C) 2024 1C-Soft LLC and others.
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

import { interfaces } from '@theia/core/shared/inversify';
import { FileService, FileServiceContribution } from '@theia/filesystem/lib/browser/file-service';
import { GitFileSystemProvider } from './git-file-system-provider';
import { GIT_RESOURCE_SCHEME } from './git-resource';

export class GitFileServiceContribution implements FileServiceContribution {

    constructor(protected readonly container: interfaces.Container) { }

    registerFileSystemProviders(service: FileService): void {
        service.onWillActivateFileSystemProvider(event => {
            if (event.scheme === GIT_RESOURCE_SCHEME) {
                service.registerProvider(GIT_RESOURCE_SCHEME, this.container.get(GitFileSystemProvider));
            }
        });
    }
}
