// *****************************************************************************
// Copyright (C) 2026 Daniel Muñoz and others.
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

import { MaybePromise } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';
// eslint-disable-next-line import/no-extraneous-dependencies
import { app, ipcMain } from '@theia/core/electron-shared/electron';
import { ElectronMainApplicationContribution } from '@theia/core/lib/electron-main/electron-main-application';
import { CHANNEL_ADD_RECENT_DOCUMENT } from '../electron-common/electron-api';

@injectable()
export class ElectronWorkspaceApi implements ElectronMainApplicationContribution {
    onStart(): MaybePromise<void> {
        ipcMain.on(CHANNEL_ADD_RECENT_DOCUMENT, (_event, path: string) => {
            app.addRecentDocument(path);
        });
    }
}
