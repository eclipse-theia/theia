/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { ContainerModule } from 'inversify';

import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';

import { ElectronMainWindowService, electronMainWindowServicePath } from '../../electron-common/electron-window-protocol';
import { ElectronIpcConnectionProvider } from '../messaging/electron-ipc-connection-provider';
import { ElectronClipboardService } from '../electron-clipboard-service';
import { ElectronWindowService } from './electron-window-service';

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    bind(ElectronMainWindowService).toDynamicValue(context =>
        ElectronIpcConnectionProvider.createProxy(context.container, electronMainWindowServicePath)
    ).inSingletonScope();
    rebind(ClipboardService).to(ElectronClipboardService).inSingletonScope();
    rebind(WindowService).to(ElectronWindowService).inSingletonScope();
});
