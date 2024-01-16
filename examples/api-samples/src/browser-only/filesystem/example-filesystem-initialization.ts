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
import { BrowserFSInitialization, DefaultBrowserFSInitialization } from '@theia/filesystem/lib/browser-only/browserfs-filesystem-initialization';
import { BrowserFSFileSystemProvider } from '@theia/filesystem/lib/browser-only/browserfs-filesystem-provider';
import type { FSModule } from 'browserfs/dist/node/core/FS';

@injectable()
export class ExampleBrowserFSInitialization extends DefaultBrowserFSInitialization {

    @inject(EncodingService)
    protected encodingService: EncodingService;

    override async initializeFS(fs: FSModule, provider: BrowserFSFileSystemProvider): Promise<void> {
        try {
            if (!fs.existsSync('/home/workspace')) {
                await provider.mkdir(new URI('/home/workspace'));
                await provider.writeFile(new URI('/home/workspace/my-file.txt'), this.encodingService.encode('foo').buffer, { create: true, overwrite: false });
                await provider.writeFile(new URI('/home/workspace/my-file2.txt'), this.encodingService.encode('bar').buffer, { create: true, overwrite: false });
            }
            if (!fs.existsSync('/home/workspace2')) {
                await provider.mkdir(new URI('/home/workspace2'));
                await provider.writeFile(new URI('/home/workspace2/my-file.json'), this.encodingService.encode('{ foo: true }').buffer, { create: true, overwrite: false });
                await provider.writeFile(new URI('/home/workspace2/my-file2.json'), this.encodingService.encode('{ bar: false }').buffer, { create: true, overwrite: false });
            }
        } catch (e) {
            console.error('An error occurred while initializing the demo workspaces', e);
        }
    }
}

export const bindBrowserFSInitialization = (bind: interfaces.Bind, rebind: interfaces.Rebind): void => {
    bind(ExampleBrowserFSInitialization).toSelf();
    rebind(BrowserFSInitialization).toService(ExampleBrowserFSInitialization);
};
