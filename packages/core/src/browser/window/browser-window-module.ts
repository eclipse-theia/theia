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
import { DefaultWindowService } from '../../browser/window/default-window-service';
import { FrontendApplicationContribution } from '../frontend-application';
import { ClipboardService } from '../clipboard-service';
import { BrowserClipboardService } from '../browser-clipboard-service';
import { SecondaryWindowService } from './secondary-window-service';
import { DefaultSecondaryWindowService } from './default-secondary-window-service';

export default new ContainerModule(bind => {
    bind(DefaultWindowService).toSelf().inSingletonScope();
    bind(WindowService).toService(DefaultWindowService);
    bind(FrontendApplicationContribution).toService(DefaultWindowService);
    bind(ClipboardService).to(BrowserClipboardService).inSingletonScope();
    bind(SecondaryWindowService).to(DefaultSecondaryWindowService).inSingletonScope();
});
