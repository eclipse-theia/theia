/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from 'inversify';
import { ApplicationServer, ExtensionInfo, ApplicationInfo } from '../common/application-protocol';
import { ApplicationPackage } from '@theia/application-package';

@injectable()
export class ApplicationServerImpl implements ApplicationServer {

    protected readonly applicationPackage: ApplicationPackage;
    constructor() {
        this.applicationPackage = new ApplicationPackage({ projectPath: process.cwd() });
    }

    getExtensionsInfos(): Promise<ExtensionInfo[]> {
        const extensions = this.applicationPackage.extensionPackages;
        const infos: ExtensionInfo[] = extensions.map(extension => ({ name: extension.name, version: extension.version }));
        return Promise.resolve(infos);
    }

    getApplicationInfo(): Promise<ApplicationInfo | undefined> {
        const pck = this.applicationPackage.pck;
        if (pck.name && pck.version) {
            const name = pck.name;
            const version = pck.version;

            return Promise.resolve({ name, version });
        }
        return Promise.resolve(undefined);
    }

}
