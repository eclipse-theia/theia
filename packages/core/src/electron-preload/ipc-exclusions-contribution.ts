// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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

import { contextBridge, ipcRenderer } from '@theia/electron/shared/electron';
import { inject, injectable } from 'inversify';
import { ElectronPreloadContribution, IpcHandleConverter, TheiaContextBridge, TheiaIpcRenderer, TheiaIpcWindow } from '../electron-common';

/**
 * This component exists to avoid pitfalls like trying to send references to
 * problematic instances from the preload context to the browser context.
 * i.e. Trying to send the {@link TheiaIpcRenderer} will send Electron's APIs
 * in what seems to be an infinite loop, freezing the application.
 */
@injectable()
export class IpcExclusionsContribution implements ElectronPreloadContribution {

    @inject(IpcHandleConverter) protected ipcHandleConverter: IpcHandleConverter;
    @inject(TheiaContextBridge) protected contextBridge: TheiaContextBridge;
    @inject(TheiaIpcRenderer) protected ipcRenderer: TheiaIpcRenderer;
    @inject(TheiaIpcWindow) protected ipcWindow: TheiaIpcWindow;

    preload(): void {
        this.getExcludedReferences().forEach(ref => {
            this.ipcHandleConverter.replaceWith(ref, undefined);
        });
    }

    protected getExcludedReferences(): object[] {
        return [
            contextBridge,
            ipcRenderer,
            this.ipcHandleConverter,
            this.contextBridge,
            this.ipcRenderer,
            this.ipcWindow
        ];
    }
}
