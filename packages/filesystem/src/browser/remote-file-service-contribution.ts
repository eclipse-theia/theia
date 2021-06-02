/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { FileServiceContribution, FileService } from './file-service';
import { RemoteFileSystemProvider } from '../common/remote-file-system-provider';

@injectable()
export class RemoteFileServiceContribution implements FileServiceContribution {

    @inject(RemoteFileSystemProvider)
    protected readonly provider: RemoteFileSystemProvider;

    registerFileSystemProviders(service: FileService): void {
        const registering = this.provider.ready.then(() =>
            service.registerProvider('file', this.provider)
        );
        service.onWillActivateFileSystemProvider(event => {
            if (event.scheme === 'file') {
                event.waitUntil(registering);
            }
        });
    }

}
