// *****************************************************************************
// Copyright (C) 2023 EclipseSource and others.
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

import { URI } from '@theia/core';
import { inject, injectable, interfaces } from '@theia/core/shared/inversify';
import { EncodingService } from '@theia/core/lib/common/encoding-service';
import { OPFSInitialization, DefaultOPFSInitialization } from '@theia/filesystem/lib/browser-only/opfs-filesystem-initialization';
import { OPFSFileSystemProvider } from '@theia/filesystem/lib/browser-only/opfs-filesystem-provider';

@injectable()
export class ExampleOPFSInitialization extends DefaultOPFSInitialization {

    @inject(EncodingService)
    protected encodingService: EncodingService;

    override async initializeFS(provider: OPFSFileSystemProvider): Promise<void> {
        // Check whether the directory exists
        if (await provider.exists(new URI('/home/workspace'))) {
            await provider.readdir(new URI('/home/workspace'));
        } else {
            await provider.mkdir(new URI('/home/workspace'));
            await provider.writeFile(new URI('/home/workspace/my-file.txt'), this.encodingService.encode('foo').buffer, { create: true, overwrite: false });
        }

        if (await provider.exists(new URI('/home/workspace2'))) {
            await provider.readdir(new URI('/home/workspace2'));
        } else {
            await provider.mkdir(new URI('/home/workspace2'));
            await provider.writeFile(new URI('/home/workspace2/my-file.json'), this.encodingService.encode('{ foo: true }').buffer, { create: true, overwrite: false });
        }
    }
}

export const bindOPFSInitialization = (bind: interfaces.Bind, rebind: interfaces.Rebind): void => {
    bind(ExampleOPFSInitialization).toSelf();
    rebind(OPFSInitialization).toService(ExampleOPFSInitialization);
};
