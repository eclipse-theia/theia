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

import { ElectronMainApplication, ElectronMainApplicationContribution } from '@theia/core/lib/electron-main/electron-main-application';
import { ElectronSecurityTokenService } from '@theia/core/lib/electron-main/electron-security-token-service';
import { inject, injectable } from '@theia/core/shared/inversify';
import { MiniBrowserEndpoint } from '../common/mini-browser-endpoint';

/**
 * Since the mini-browser might serve content from a new origin,
 * we need to attach the ElectronSecurityToken for the Electron
 * backend to accept HTTP requests.
 */
@injectable()
export class MiniBrowserElectronMainContribution implements ElectronMainApplicationContribution {

    @inject(ElectronSecurityTokenService)
    protected readonly electronSecurityTokenService: ElectronSecurityTokenService;

    async onStart(app: ElectronMainApplication): Promise<void> {
        const url = this.getMiniBrowserEndpoint(await app.backendPort);
        await this.electronSecurityTokenService.setElectronSecurityTokenCookie(url);
    }

    protected getMiniBrowserEndpoint(port: number): string {
        const pattern = process.env[MiniBrowserEndpoint.HOST_PATTERN_ENV] ?? MiniBrowserEndpoint.HOST_PATTERN_DEFAULT;
        return 'http://' + pattern.replace('{{hostname}}', `localhost:${port}`);
    }
}
