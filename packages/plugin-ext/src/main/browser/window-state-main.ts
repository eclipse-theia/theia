/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import URI from 'vscode-uri';
import { interfaces } from 'inversify';
import { WindowStateExt, MAIN_RPC_CONTEXT, WindowMain } from '../../common/plugin-api-rpc';
import { RPCProtocol } from '../../common/rpc-protocol';
import { UriComponents } from '../../common/uri-components';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { WindowService } from '@theia/core/lib/browser/window/window-service';

export class WindowStateMain implements WindowMain, Disposable {

    private readonly proxy: WindowStateExt;

    private readonly windowService: WindowService;

    private readonly toDispose = new DisposableCollection();

    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.WINDOW_STATE_EXT);
        this.windowService = container.get(WindowService);

        const fireDidFocus = () => this.onFocusChanged(true);
        window.addEventListener('focus', fireDidFocus);
        this.toDispose.push(Disposable.create(() => window.removeEventListener('focus', fireDidFocus)));

        const fireDidBlur = () => this.onFocusChanged(false);
        window.addEventListener('blur', fireDidBlur);
        this.toDispose.push(Disposable.create(() => window.removeEventListener('blur', fireDidBlur)));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    private onFocusChanged(focused: boolean): void {
        this.proxy.$onWindowStateChanged(focused);
    }

    async $openUri(uriComponent: UriComponents): Promise<boolean> {
        const uri = URI.revive(uriComponent);
        const url = encodeURI(uri.toString(true));
        try {
            this.windowService.openNewWindow(url, { external: true });
            return true;
        } catch (e) {
            return false;
        }
    }

}
