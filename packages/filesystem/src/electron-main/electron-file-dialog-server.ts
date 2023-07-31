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

import { RpcContext, RpcServer } from '@theia/core';
// eslint-disable-next-line max-len
import { BrowserWindow, dialog, OpenDialogOptions as ElectronOpenDialogOptions, SaveDialogOptions as ElectronSaveDialogOptions, WebContents } from '@theia/core/electron-shared/electron';
import { SenderWebContents } from '@theia/core/lib/electron-main';
import { injectable } from '@theia/core/shared/inversify';
import { ElectronFileDialog, OpenDialogOptions, SaveDialogOptions } from '../electron-common';

@injectable()
export class ElectronFileDialogServer implements RpcServer<ElectronFileDialog> {

    async $showOpenDialog(ctx: RpcContext, cwd: string, options?: OpenDialogOptions): Promise<string[] | undefined> {
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
            const win = BrowserWindow.fromWebContents(this.getWebContents(ctx));
            if (win) {
                return (await dialog.showOpenDialog(win, dialogOpts)).filePaths;
            }
        }
        return (await dialog.showOpenDialog(dialogOpts)).filePaths;
    }

    async $showSaveDialog(ctx: RpcContext, cwd: string, options?: SaveDialogOptions): Promise<string | undefined> {
        const dialogOpts: ElectronSaveDialogOptions = {
            defaultPath: cwd,
            buttonLabel: options?.buttonLabel,
            filters: options?.filters,
            title: options?.title
        };
        if (options?.modal) {
            const win = BrowserWindow.fromWebContents(this.getWebContents(ctx));
            if (win) {
                return (await dialog.showSaveDialog(win, dialogOpts)).filePath;
            }
        }
        return (await dialog.showSaveDialog(dialogOpts)).filePath;
    }

    protected getWebContents(ctx: RpcContext): WebContents {
        return ctx.require(SenderWebContents);
    }
}
