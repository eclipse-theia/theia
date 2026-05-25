/********************************************************************************
 * Copyright (C) 2024 TypeFox and others.
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
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
 ********************************************************************************/

import { CommandContribution, CommandRegistry } from '@theia/core';
import { inject, injectable, interfaces } from '@theia/core/shared/inversify';
import { RemoteFileSystemProvider } from '@theia/filesystem/lib/common/remote-file-system-provider';
import { FileSystemProviderCapabilities } from '@theia/filesystem/lib/common/files';
import { MarkdownStringImpl } from '@theia/core/lib/common/markdown-rendering';

@injectable()
export class SampleFileSystemCapabilities implements CommandContribution {

    @inject(RemoteFileSystemProvider)
    protected readonly remoteFileSystemProvider: RemoteFileSystemProvider;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand({
            id: 'toggleFileSystemReadonly',
            label: 'Toggle File System Readonly',
            category: 'API Samples'
        }, {
            execute: () => {
                const readonly = (this.remoteFileSystemProvider.capabilities & FileSystemProviderCapabilities.Readonly) !== 0;
                if (readonly) {
                    this.remoteFileSystemProvider['setCapabilities'](this.remoteFileSystemProvider.capabilities & ~FileSystemProviderCapabilities.Readonly);
                } else {
                    this.remoteFileSystemProvider['setCapabilities'](this.remoteFileSystemProvider.capabilities | FileSystemProviderCapabilities.Readonly);
                }
            }
        });

        commands.registerCommand({
            id: 'addFileSystemReadonlyMessage',
            label: 'Add File System ReadonlyMessage',
            category: 'API Samples'
        }, {
            execute: () => {
                const readonlyMessage = new MarkdownStringImpl(`Added new **Markdown** string '+${Date.now()}`);
                this.remoteFileSystemProvider['setReadOnlyMessage'](readonlyMessage);
            }
        });

        commands.registerCommand({
            id: 'removeFileSystemReadonlyMessage',
            label: 'Remove File System ReadonlyMessage',
            category: 'API Samples'
        }, {
            execute: () => {
                this.remoteFileSystemProvider['setReadOnlyMessage'](undefined);
            }
        });
    }

}

export function bindSampleFileSystemCapabilitiesCommands(bind: interfaces.Bind): void {
    bind(CommandContribution).to(SampleFileSystemCapabilities).inSingletonScope();
}
