/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
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

import { shell } from 'electron';
import { injectable, inject } from 'inversify';
import { ElectronMainWindowService } from '../electron-common/electron-window-protocol';
import { ElectronApplication } from './electron-application';

@injectable()
export class DefaultElectronMainWindowService implements ElectronMainWindowService {

    @inject(ElectronApplication)
    protected readonly app: ElectronApplication;

    openElectronWindow(url: string): void {
        this.app.openWindowWithWorkspace(url);
    }

    openExternalWindow(url: string): void {
        shell.openExternal(url);
    }

}
