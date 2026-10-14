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
import { WindowService } from '../../browser/window/window-service.js';
import { DefaultWindowService } from '../../browser/window/default-window-service.js';
import { FrontendApplicationContribution } from '../frontend-application-contribution.js';
import { ClipboardService } from '../clipboard-service.js';
import { BrowserClipboardService } from '../browser-clipboard-service.js';
import { SecondaryWindowService } from './secondary-window-service.js';
import { DefaultSecondaryWindowService } from './default-secondary-window-service.js';
import { bindRootContributionProvider } from '../../common/index.js';
import { WindowTitleContribution } from './window-title-service.js';
import { WindowFocusService } from './window-focus-service.js';
import { DefaultWindowLaunchArgs, WindowLaunchArgs } from './window-launch-args.js';

export default new ContainerModule(bind => {
    bind(DefaultWindowService).toSelf().inSingletonScope();
    bind(WindowService).toService(DefaultWindowService);
    bind(FrontendApplicationContribution).toService(DefaultWindowService);
    bind(ClipboardService).to(BrowserClipboardService).inSingletonScope();
    bind(SecondaryWindowService).to(DefaultSecondaryWindowService).inSingletonScope();
    bind(WindowFocusService).toSelf().inSingletonScope();
    bind(DefaultWindowLaunchArgs).toSelf().inSingletonScope();
    bind(WindowLaunchArgs).toService(DefaultWindowLaunchArgs);
    bindRootContributionProvider(bind, WindowTitleContribution);
});
