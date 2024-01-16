// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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

import * as fs from 'fs-extra';
import { ApplicationPackage } from '@theia/application-package';

export interface GeneratorOptions {
    mode?: 'development' | 'production'
    splitFrontend?: boolean
}

export abstract class AbstractGenerator {

    constructor(
        protected readonly pck: ApplicationPackage,
        protected options: GeneratorOptions = {}
    ) { }

    protected ifBrowser(value: string, defaultValue: string = ''): string {
        return this.pck.ifBrowser(value, defaultValue);
    }

    protected ifElectron(value: string, defaultValue: string = ''): string {
        return this.pck.ifElectron(value, defaultValue);
    }

    protected ifBrowserOnly(value: string, defaultValue: string = ''): string {
        return this.pck.ifBrowserOnly(value, defaultValue);
    }

    protected async write(path: string, content: string): Promise<void> {
        await fs.ensureFile(path);
        await fs.writeFile(path, content);
    }

    protected ifMonaco(value: () => string, defaultValue: () => string = () => ''): string {
        return this.ifPackage([
            '@theia/monaco',
            '@theia/monaco-editor-core'
        ], value, defaultValue);
    }

    protected ifPackage(packageName: string | string[], value: string | (() => string), defaultValue: string | (() => string) = ''): string {
        const packages = Array.isArray(packageName) ? packageName : [packageName];
        if (this.pck.extensionPackages.some(e => packages.includes(e.name))) {
            return typeof value === 'string' ? value : value();
        } else {
            return typeof defaultValue === 'string' ? defaultValue : defaultValue();
        }
    }

    protected prettyStringify(object: object): string {
        return JSON.stringify(object, undefined, 4);
    }

}
