// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
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

import { BackendApplicationContribution } from '@theia/core/lib/node';
import { BackendApplicationConfigProvider } from '@theia/core/lib/node/backend-application-config-provider';
import { injectable } from '@theia/core/shared/inversify';
import { MiniBrowserEndpoint } from '../common/mini-browser-endpoint';

@injectable()
export class MiniBrowserBackendSecurityWarnings implements BackendApplicationContribution {

    initialize(): void {
        this.checkHostPattern();
    }

    protected async checkHostPattern(): Promise<void> {
        if (BackendApplicationConfigProvider.get()['warnOnPotentiallyInsecureHostPattern'] === false) {
            return;
        }
        const envHostPattern = process.env[MiniBrowserEndpoint.HOST_PATTERN_ENV];
        if (envHostPattern && envHostPattern !== MiniBrowserEndpoint.HOST_PATTERN_DEFAULT) {
            console.warn(`\
MINI BROWSER SECURITY WARNING

    Changing the @theia/mini-browser host pattern can lead to security vulnerabilities.
        Current pattern: "${envHostPattern}"
    Please read @theia/mini-browser/README.md for more information.
`
            );
        }
    }
}
