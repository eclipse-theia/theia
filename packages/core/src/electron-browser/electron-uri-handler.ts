// *****************************************************************************
// Copyright (C) 2024 STMicroelectronics and others.
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

import { FrontendApplicationContribution, OpenerService } from '../browser';

import { injectable, inject } from 'inversify';
import { URI } from '../common';

@injectable()
export class ElectronUriHandlerContribution implements FrontendApplicationContribution {
    @inject(OpenerService)
    protected readonly openenerService: OpenerService;

    initialize(): void {
        window.electronTheiaCore.setOpenUrlHandler(async url => {
            const uri = new URI(url);
            try {
                const handler = await this.openenerService.getOpener(uri);
                if (handler) {
                    await handler.open(uri);
                    return true;
                }
            } catch (e) {
                // no handler
            }
            return false;
        });
    }
}
