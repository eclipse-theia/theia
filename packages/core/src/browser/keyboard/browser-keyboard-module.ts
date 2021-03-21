/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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
import { CommandContribution } from '../../common/command';
import { KeyboardLayoutProvider, KeyboardLayoutChangeNotifier, KeyValidator } from '../../common/keyboard/keyboard-layout-provider';
import { BrowserKeyboardLayoutProvider } from './browser-keyboard-layout-provider';
import { BrowserKeyboardFrontendContribution } from './browser-keyboard-frontend-contribution';

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    bind(BrowserKeyboardLayoutProvider).toSelf().inSingletonScope();
    bind(KeyboardLayoutProvider).toService(BrowserKeyboardLayoutProvider);
    bind(KeyboardLayoutChangeNotifier).toService(BrowserKeyboardLayoutProvider);
    bind(KeyValidator).toService(BrowserKeyboardLayoutProvider);
    bind(BrowserKeyboardFrontendContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(BrowserKeyboardFrontendContribution);
});
