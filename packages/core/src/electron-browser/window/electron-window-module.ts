// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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

import { ContainerModule } from 'inversify';
import { WindowService } from '../../browser/window/window-service';
import { ElectronWindowService } from './electron-window-service';
import { FrontendApplicationContribution } from '../../browser/frontend-application';
import { ElectronClipboardService } from '../electron-clipboard-service';
import { ClipboardService } from '../../browser/clipboard-service';
import { ElectronMainWindowService, electronMainWindowServicePath } from '../../electron-common/electron-main-window-service';
import { ElectronIpcConnectionProvider } from '../messaging/electron-ipc-connection-provider';
import { bindWindowPreferences } from './electron-window-preferences';
import { FrontendApplicationStateService } from '../../browser/frontend-application-state';
import { ElectronFrontendApplicationStateService } from './electron-frontend-application-state';
import { ElectronSecondaryWindowService } from './electron-secondary-window-service';
import { SecondaryWindowService } from '../../browser/window/secondary-window-service';

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    bind(ElectronMainWindowService).toDynamicValue(context =>
        ElectronIpcConnectionProvider.createProxy(context.container, electronMainWindowServicePath)
    ).inSingletonScope();
    bindWindowPreferences(bind);
    bind(WindowService).to(ElectronWindowService).inSingletonScope();
    bind(FrontendApplicationContribution).toService(WindowService);
    bind(ClipboardService).to(ElectronClipboardService).inSingletonScope();
    rebind(FrontendApplicationStateService).to(ElectronFrontendApplicationStateService).inSingletonScope();
    bind(SecondaryWindowService).to(ElectronSecondaryWindowService).inSingletonScope();
});
