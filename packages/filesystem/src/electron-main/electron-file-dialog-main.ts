// *****************************************************************************
// Copyright (C) 2023 STMicroelectronics and others.
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

import { BrowserWindow, dialog, OpenDialogOptions as ElectronOpenDialogOptions, SaveDialogOptions as ElectronSaveDialogOptions } from '@theia/core/electron-shared/electron';
import { TheiaIpcMain, TheiaIpcMainInvokeEvent } from '@theia/core/lib/electron-common';
import { ElectronMainApplicationContribution } from '@theia/core/lib/electron-main/electron-main-application';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ELECTRON_FILE_DIALOG_IPC as ipc, OpenDialogOptions, SaveDialogOptions } from '../electron-common';

@injectable()
export class ElectronFileDialogMain implements ElectronMainApplicationContribution {

    @inject(TheiaIpcMain)
    protected ipcMain: TheiaIpcMain;

    onStart(): void {
        this.ipcMain.handle(ipc.showOpenDialog, this.handleShowOpenDialog, this);
        this.ipcMain.handle(ipc.showSaveDialog, this.handleSaveOpenDialog, this);
    }

    protected async handleShowOpenDialog(event: TheiaIpcMainInvokeEvent, cwd: string, options?: OpenDialogOptions): Promise<string[] | undefined> {
        const properties: ElectronOpenDialogOptions['properties'] = [];
        // checking proper combination of file/dir opening is done on the renderer side
        if (options?.openFiles) {
            properties.push('openFile');
        }
        if (options?.openFolders) {
            properties.push('openDirectory');
        }
        if (options?.selectMany === true) {
            properties.push('multiSelections');
        }
        const dialogOpts: ElectronOpenDialogOptions = {
            defaultPath: cwd,
            buttonLabel: options?.buttonLabel,
            filters: options?.filters,
            title: options?.title,
            properties: properties
        };
        if (options?.modal) {
            const win = BrowserWindow.fromWebContents(event.sender);
            if (win) {
                return (await dialog.showOpenDialog(win, dialogOpts)).filePaths;
            }
        }
        return (await dialog.showOpenDialog(dialogOpts)).filePaths;
    }

    protected async handleSaveOpenDialog(event: TheiaIpcMainInvokeEvent, cwd: string, options?: SaveDialogOptions): Promise<string | undefined> {
        const dialogOpts: ElectronSaveDialogOptions = {
            defaultPath: cwd,
            buttonLabel: options?.buttonLabel,
            filters: options?.filters,
            title: options?.title
        };
        if (options?.modal) {
            const win = BrowserWindow.fromWebContents(event.sender);
            if (win) {
                return (await dialog.showSaveDialog(win, dialogOpts)).filePath;
            }
        }
        return (await dialog.showSaveDialog(dialogOpts)).filePath;
    };
}
