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

import { getCurrentKeyboardLayout, getKeyMap, onDidChangeKeyboardLayout } from '@theia/electron/shared/native-keymap';
import { inject, injectable } from 'inversify';
import { RpcEvent, RpcServer } from '../../common';
import { ElectronKeyboardLayout, NativeKeyboardLayout } from '../../electron-common';
import { ElectronMainApplicationContribution } from '../electron-main-application';

@injectable()
export class ElectronKeyboardLayoutServer implements RpcServer<ElectronKeyboardLayout>, ElectronMainApplicationContribution {

    @inject(RpcEvent) $onKeyboardLayoutChanged: RpcEvent<NativeKeyboardLayout>;

    onStart(): void {
        onDidChangeKeyboardLayout(() => {
            this.$onKeyboardLayoutChanged.sendAll({
                info: getCurrentKeyboardLayout(),
                mapping: getKeyMap()
            });
        });
    }
}
