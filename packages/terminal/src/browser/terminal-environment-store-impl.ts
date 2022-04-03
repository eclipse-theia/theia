// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { ENVIRONMENT_VARIABLE_COLLECTIONS_KEY, TerminalEnvironmentStore } from '../common/base-terminal-protocol';
import { StorageService } from '@theia/core/lib/browser';

@injectable()
export class TerminalEnvironmentStoreImpl implements TerminalEnvironmentStore {

    @inject(StorageService)
    protected storageService: StorageService;

    async getEnvironmentVariables(): Promise<string | undefined> {
        return this.storageService.getData<string>(ENVIRONMENT_VARIABLE_COLLECTIONS_KEY);
    }

    async saveEnvironmentVariables(data: string): Promise<void> {
        await this.storageService.setData(ENVIRONMENT_VARIABLE_COLLECTIONS_KEY, data);
    }
}
