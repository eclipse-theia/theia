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
import { OpenHandler } from '../../browser/index.js';
import { ClipboardService } from '../../browser/clipboard-service.js';
import { FrontendApplicationContribution } from '../../browser/frontend-application-contribution.js';
import { FrontendApplicationStateService } from '../../browser/frontend-application-state.js';
import { SecondaryWindowService } from '../../browser/window/secondary-window-service.js';
import { WindowService } from '../../browser/window/window-service.js';
import { ElectronMainWindowService, electronMainWindowServicePath } from '../../electron-common/electron-main-window-service.js';
import { ElectronClipboardService } from '../electron-clipboard-service.js';
import { ElectronIpcConnectionProvider } from '../messaging/electron-ipc-connection-source.js';
import { ElectronFrontendApplicationStateService } from './electron-frontend-application-state.js';
import { ElectronSecondaryWindowService } from './electron-secondary-window-service.js';
import { bindWindowPreferences } from '../../electron-common/electron-window-preferences.js';
import { ElectronWindowService } from './electron-window-service.js';
import { ExternalAppOpenHandler } from './external-app-open-handler.js';
import { ElectronUriHandlerContribution } from '../electron-uri-handler.js';
import { bindRootContributionProvider } from '../../common/index.js';
import { WindowTitleContribution } from '../../browser/window/window-title-service.js';
import { WindowFocusService } from '../../browser/window/window-focus-service.js';
import { WindowLaunchArgs } from '../../browser/window/window-launch-args.js';
import { ElectronWindowLaunchArgs } from './electron-window-launch-args.js';
import { WindowZoomStatusBarItem } from './window-zoom-status-bar-item.js';
import '../../../src/electron-browser/style/window-zoom-action-bar.css';

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
    // `browser-window-module` (which binds `WindowLaunchArgs`) is not loaded in Electron, since the
    // `window` extension provides `electron-window-module` as its `frontendElectron` replacement.
    // Bind here directly, mirroring how `WindowService` is bound in each of the two modules.
    bind(ElectronWindowLaunchArgs).toSelf().inSingletonScope();
    bind(WindowLaunchArgs).toService(ElectronWindowLaunchArgs);
    bind(SecondaryWindowService).to(ElectronSecondaryWindowService).inSingletonScope();
    bind(ExternalAppOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(ExternalAppOpenHandler);
    bindRootContributionProvider(bind, WindowTitleContribution);
    bind(WindowFocusService).toSelf().inSingletonScope();
    bind(WindowZoomStatusBarItem).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(WindowZoomStatusBarItem);
});
