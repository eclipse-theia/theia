// *****************************************************************************
// Copyright (C) 2020 Ericsson and others.
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

import { MAIN_RPC_CONTEXT, ThemingMain, ThemingExt } from '../../common/plugin-api-rpc';
import { RPCProtocol } from '../../common/rpc-protocol';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { Disposable } from '@theia/core/lib/common/disposable';

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// some code copied and modified from https://github.com/microsoft/vscode/blob/bafca191f55a234fad20ab67bb689aacc80e7a1a/src/vs/workbench/api/browser/mainThreadTheming.ts

export class ThemingMainImpl implements ThemingMain {

    private readonly proxy: ThemingExt;
    private readonly themeChangeListener: Disposable;

    constructor(rpc: RPCProtocol, themeService: ThemeService) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.THEMING_EXT);
        this.themeChangeListener = themeService.onDidColorThemeChange(e => this.proxy.$onColorThemeChange(e.newTheme.type));
        this.proxy.$onColorThemeChange(themeService.getCurrentTheme().type);
    }

    dispose(): void {
        this.themeChangeListener.dispose();
    }
}
