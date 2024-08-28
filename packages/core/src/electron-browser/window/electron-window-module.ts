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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from 'inversify';
import { OpenHandler } from '../../browser';
import { ClipboardService } from '../../browser/clipboard-service';
import { FrontendApplicationContribution } from '../../browser/frontend-application-contribution';
import { FrontendApplicationStateService } from '../../browser/frontend-application-state';
import { SecondaryWindowService } from '../../browser/window/secondary-window-service';
import { WindowService } from '../../browser/window/window-service';
import { ElectronMainWindowService, electronMainWindowServicePath } from '../../electron-common/electron-main-window-service';
import { ElectronClipboardService } from '../electron-clipboard-service';
import { ElectronIpcConnectionProvider } from '../messaging/electron-ipc-connection-source';
import { ElectronFrontendApplicationStateService } from './electron-frontend-application-state';
import { ElectronSecondaryWindowService } from './electron-secondary-window-service';
import { bindWindowPreferences } from './electron-window-preferences';
import { ElectronWindowService } from './electron-window-service';
import { ExternalAppOpenHandler } from './external-app-open-handler';
import { ElectronUriHandlerContribution } from '../electron-uri-handler';

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    bind(ElectronMainWindowService).toDynamicValue(context =>
        ElectronIpcConnectionProvider.createProxy(context.container, electronMainWindowServicePath)
    ).inSingletonScope();
    bindWindowPreferences(bind);
    bind(WindowService).to(ElectronWindowService).inSingletonScope();
    bind(FrontendApplicationContribution).toService(WindowService);
    bind(ElectronUriHandlerContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ElectronUriHandlerContribution);
    bind(ClipboardService).to(ElectronClipboardService).inSingletonScope();
    rebind(FrontendApplicationStateService).to(ElectronFrontendApplicationStateService).inSingletonScope();
    bind(SecondaryWindowService).to(ElectronSecondaryWindowService).inSingletonScope();
    bind(ExternalAppOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(ExternalAppOpenHandler);
});
