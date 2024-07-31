// *****************************************************************************
// Copyright (C) 2018 Ericsson and others.
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

import { injectable, inject } from 'inversify';
import { ApplicationServer, ExtensionInfo, ApplicationInfo } from '../common/application-protocol';
import { ApplicationPackage } from '@theia/application-package';
import { OS } from '../common/os';

@injectable()
export class ApplicationServerImpl implements ApplicationServer {

    @inject(ApplicationPackage)
    protected readonly applicationPackage: ApplicationPackage;

    getExtensionsInfos(): Promise<ExtensionInfo[]> {
        // @ts-expect-error
        const appInfo: ExtensionInfo[] = globalThis.extensionInfo;
        return Promise.resolve(appInfo);
    }

    getApplicationInfo(): Promise<ApplicationInfo | undefined> {
        const pck = this.applicationPackage.pck;
        if (pck.name && pck.version) {
            const name = pck.name;
            const version = pck.version;

            return Promise.resolve({
                name,
                version
            });
        }
        return Promise.resolve(undefined);
    }

    getApplicationRoot(): Promise<string> {
        return Promise.resolve(this.applicationPackage.projectPath);
    }

    getApplicationPlatform(): Promise<string> {
        return Promise.resolve(`${process.platform}-${process.arch}`);
    }

    async getBackendOS(): Promise<OS.Type> {
        return OS.type();
    }
}
