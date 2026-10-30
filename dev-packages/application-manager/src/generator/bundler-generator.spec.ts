// *****************************************************************************
// Copyright (C) 2026 Robert Jandow and others.
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

import { expect } from 'chai';
import { ApplicationPackage, ApplicationProps } from '@theia/application-package';
import { BundlerGenerator } from './bundler-generator';

class TestBundlerGenerator extends BundlerGenerator {
    browserConfig(): string {
        return this.compileESBuildBrowserConfig();
    }
}

function createPackage(target: ApplicationProps.Target, extensionNames: string[]): ApplicationPackage {
    // The browser config only looks at the target and the extension names, so stub those
    // instead of loading a real application from disk.
    const pck = Object.create(ApplicationPackage.prototype) as ApplicationPackage;
    Object.defineProperty(pck, 'target', { value: target });
    Object.defineProperty(pck, 'extensionPackages', { value: extensionNames.map(name => ({ name })) });
    return pck;
}

describe('BundlerGenerator', () => {

    describe('webview files', () => {

        it('copies them to lib/webview/pre for the browser target', () => {
            const config = new TestBundlerGenerator(createPackage('browser', ['@theia/plugin-ext'])).browserConfig();
            expect(config).to.contain("to: join(__dirname, 'lib', 'webview', 'pre')");
            expect(config).not.to.contain("join(__dirname, 'lib', 'frontend', 'webview')");
        });

        it('copies them next to the frontend bundle for the browser-only target', () => {
            const config = new TestBundlerGenerator(createPackage('browser-only', ['@theia/plugin-ext'])).browserConfig();
            expect(config).to.contain("to: join(__dirname, 'lib', 'frontend', 'webview')");
            expect(config).not.to.contain("join(__dirname, 'lib', 'webview', 'pre')");
        });

        it('does not copy them without @theia/plugin-ext', () => {
            const config = new TestBundlerGenerator(createPackage('browser-only', [])).browserConfig();
            expect(config).not.to.contain('webview');
        });
    });
});
