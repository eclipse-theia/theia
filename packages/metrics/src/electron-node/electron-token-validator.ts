// *****************************************************************************
// Copyright (C) 2023 STMicroelectronics and others.
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

import { injectable, postConstruct } from '@theia/core/shared/inversify';
import { ElectronTokenValidator } from '@theia/core/lib/electron-node/token/electron-token-validator';
import { IncomingMessage } from 'http';
import { MetricsBackendApplicationContribution } from '../node/metrics-backend-application-contribution';
import { MaybePromise } from '@theia/core';

@injectable()
export class MetricsElectronTokenValidator extends ElectronTokenValidator {
    @postConstruct()
    protected override init(): void {
        super.init();
    }

    override allowWsUpgrade(request: IncomingMessage): MaybePromise<boolean> {
        return this.allowRequest(request);
    }

    override allowRequest(request: IncomingMessage): boolean {
        return request.url === MetricsBackendApplicationContribution.ENDPOINT || super.allowRequest(request);
    }
}
