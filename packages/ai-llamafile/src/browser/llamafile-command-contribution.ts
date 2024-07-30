// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
import { CommandContribution, CommandRegistry } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { QuickInputService } from '@theia/core/lib/browser';
import { FileDialogService, OpenFileDialogProps } from '@theia/filesystem/lib/browser';
import { LlamafileListItem } from './llamafile-list-widget';

export const CREATE_LANGUAGE_MODEL = {
    id: 'core.keyboard.languagemodel',
    label: 'Create Language Model',
};

export const NewLlamafileEntryInput = {
    id: 'llamafile.input.new.entry',
    label: 'New Llamafile Entry',
};

@injectable()
export class NewLlamafileConfigQuickInputProvider {

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    @inject(FileDialogService)
    protected readonly fileDialogService: FileDialogService;

    async askForNameAndPath(): Promise<LlamafileListItem> {
        // Get the name input
        const name = await this.quickInputService.input({
            prompt: 'Enter a name'
        });

        if (!name) {
            throw new Error('Name input was canceled.');
        }

        // Get the path input using a file system picker
        const path = await this.askForPath();

        if (!path) {
            throw new Error('Path selection was canceled.');
        }

        const port = await this.quickInputService.input({
            prompt: 'Enter a port'
        });

        if (!port || isNaN(Number(port))) {
            throw new Error('Port input was canceled.');
        }

        return { name, path, port: Number(port), started: false, active: false };
    }

    private async askForPath(): Promise<string | undefined> {
        const props: OpenFileDialogProps = {
            title: 'Select a file',
            canSelectFiles: true,
            canSelectFolders: false,
            filters: {
                'Llamafile': ['llamafile']
            },
            canSelectMany: false
        };

        const uri = await this.fileDialogService.showOpenDialog(props);

        if (uri) {
            return uri.toString();
        }

        return undefined;
    }
}

@injectable()
export class LlamafileCommandContribution implements CommandContribution {

    @inject(NewLlamafileConfigQuickInputProvider)
    protected readonly quickInputProvider: NewLlamafileConfigQuickInputProvider;

    registerCommands(commandRegistry: CommandRegistry): void {
        commandRegistry.registerCommand(NewLlamafileEntryInput, {
            execute: async () => {
                try {
                    return await this.quickInputProvider.askForNameAndPath();
                } catch (error) {
                    console.error('Input process was canceled or failed.', error);
                }
            }
        });
    }


}
