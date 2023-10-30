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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
import { CHANNEL_SHOW_OPEN, CHANNEL_SHOW_SAVE, OpenDialogOptions, SaveDialogOptions, TheiaFilesystemAPI } from '../electron-common/electron-api';

// eslint-disable-next-line import/no-extraneous-dependencies
import { ipcRenderer, contextBridge } from '@theia/core/electron-shared/electron';

const api: TheiaFilesystemAPI = {
    showOpenDialog: (options: OpenDialogOptions) => ipcRenderer.invoke(CHANNEL_SHOW_OPEN, options),
    showSaveDialog: (options: SaveDialogOptions) => ipcRenderer.invoke(CHANNEL_SHOW_SAVE, options),
};

export function preload(): void {
    console.log('exposing theia filesystem electron api');

    contextBridge.exposeInMainWorld('electronTheiaFilesystem', api);

}
