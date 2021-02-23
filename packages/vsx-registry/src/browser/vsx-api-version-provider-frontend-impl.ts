/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { VSXEnvironment } from '../common/vsx-environment';
import { VSXApiVersionProvider } from '../common/vsx-api-version-provider';
import { FrontendApplicationContribution, FrontendApplication } from '@theia/core/lib/browser';

@injectable()
export class VSXApiVersionProviderImpl implements VSXApiVersionProvider, FrontendApplicationContribution {

    @inject(VSXEnvironment)
    protected readonly vsxEnvironment: VSXEnvironment;

    protected _apiVersion: string;

    async onStart(_app: FrontendApplication): Promise<void> {
        this._apiVersion = await this.vsxEnvironment.getVscodeApiVersion();
    }

    getApiVersion(): string {
        return this._apiVersion;
    }

}
