/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import * as os from 'os';
import * as fs from 'fs-extra';
import * as yargs from 'yargs';
import { ApplicationPackage } from '@theia/application-package';

const argv = yargs.option('mode', {
    description: 'Mode to use',
    choices: ['development', 'production'],
    default: 'production'
}).option('split-frontend', {
    description: 'Split frontend modules into separate chunks. By default enabled in the dev mode and disabled in the prod mode.',
    type: 'boolean',
    default: undefined
}).option('app-target', {
    description: 'The target application type. Overrides ["theia.target"] in the application\'s package.json.',
    choices: ['browser', 'electron'],
}).argv;
const mode: 'development' | 'production' = argv.mode;
const splitFrontend: boolean = argv['split-frontend'] === undefined ? mode === 'development' : argv['split-frontend'];

export abstract class AbstractGenerator {

    constructor(
        protected readonly pck: ApplicationPackage
    ) { }

    protected compileFrontendModuleImports(modules: Map<string, string>): string {
        return this.compileModuleImports(modules, splitFrontend ? 'import' : 'require');
    }

    protected compileBackendModuleImports(modules: Map<string, string>): string {
        return this.compileModuleImports(modules, 'require');
    }

    protected compileElectronMainModuleImports(modules?: Map<string, string>): string {
        return modules && this.compileModuleImports(modules, 'require') || '';
    }

    protected compileModuleImports(modules: Map<string, string>, fn: 'import' | 'require'): string {
        if (modules.size === 0) {
            return '';
        }
        const lines = Array.from(modules.keys()).map(moduleName => {
            const invocation = `${fn}('${modules.get(moduleName)}')`;
            if (fn === 'require') {
                return `Promise.resolve(${invocation})`;
            }
            return invocation;
        }).map(statement => `    .then(function () { return ${statement}.then(load) })`);
        return os.EOL + lines.join(os.EOL);
    }

    protected ifBrowser(value: string, defaultValue: string = ''): string {
        return this.pck.ifBrowser(value, defaultValue);
    }

    protected ifElectron(value: string, defaultValue: string = ''): string {
        return this.pck.ifElectron(value, defaultValue);
    }

    protected async write(path: string, content: string): Promise<void> {
        await fs.ensureFile(path);
        await fs.writeFile(path, content);
    }

    protected ifMonaco(value: () => string, defaultValue: () => string = () => ''): string {
        return (this.pck.extensionPackages.some(e => e.name === '@theia/monaco') ? value : defaultValue)();
    }

    protected prettyStringify(object: object): string {
        // eslint-disable-next-line no-null/no-null
        return JSON.stringify(object, null, 4);
    }

}
