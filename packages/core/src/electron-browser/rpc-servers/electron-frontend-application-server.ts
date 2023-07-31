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

import { inject, injectable, postConstruct } from 'inversify';
import { FrontendApplicationStateService } from '../../browser/frontend-application-state';
import { WindowService } from '../../browser/window/window-service';
import { RpcContext, RpcEvent, RpcServer } from '../../common';
import { FrontendApplicationState, StopReason } from '../../common/frontend-application-state';
import { ElectronFrontendApplication } from '../../electron-common';

@injectable()
export class ElectronFrontendApplicationServer implements RpcServer<ElectronFrontendApplication> {

    @inject(RpcEvent) $onDidUpdateApplicationState: RpcEvent<FrontendApplicationState>;

    @inject(FrontendApplicationStateService)
    protected frontendApplicationStateService: FrontendApplicationStateService;

    @inject(WindowService)
    protected windowService: WindowService;

    @postConstruct()
    protected init(): void {
        this.frontendApplicationStateService.onStateChanged(state => this.$onDidUpdateApplicationState.sendAll(state));
    }

    // [RpcNewClient](client: unknown): void {
    //     this.$onDidUpdateApplicationState.sendTo(this.frontendApplicationStateService.state, [client]);
    // }

    $canClose(ctx: RpcContext, reason: StopReason): Promise<boolean> {
        return this.windowService.isSafeToShutDown(reason);
    }
}
