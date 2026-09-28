// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import 'reflect-metadata';
import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import * as temp from 'temp';
import { Container } from '@theia/core/shared/inversify';
import { OS } from '@theia/core';
import { ILogger } from '@theia/core/lib/common/logger';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { BundledResourceProvider } from '@theia/core/lib/node';
import { ShellIntegrationInjector } from './shell-integration-injector';

describe('ShellIntegrationInjector', () => {

    const track = temp.track();

    /** Stands for the location outside of the application bundle at which the scripts are made available. */
    let externalRoot: string;
    let requestedPath: string | undefined;
    let injector: ShellIntegrationInjector;

    /**
     * The injector dispatches on the shell type that `guessShellTypeFromExecutable` derives, which depends on
     * the platform: on Windows, `bash` is taken to be Git Bash, which the injector does not handle. Pin the
     * platform so that the tests cover the same branches everywhere. Restore it per test rather than once for
     * the suite, because `shell-type.spec.ts` installs a root hook that resets it after every test.
     */
    const originalIsWindows = OS.backend.isWindows;
    beforeEach(() => Object.defineProperty(OS.backend, 'isWindows', { value: false }));
    afterEach(() => Object.defineProperty(OS.backend, 'isWindows', { value: originalIsWindows }));

    beforeEach(async () => {
        externalRoot = track.mkdirSync();
        for (const file of ['bash/bash-integration.bash', 'zsh/zsh-integration.zsh', 'zsh/zdotdir/.zshrc']) {
            const filePath = path.join(externalRoot, file);
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, '');
        }
        requestedPath = undefined;
        injector = createInjector();
        await injector.initialize();
    });

    afterEach(() => track.cleanupSync());

    function createInjector(): ShellIntegrationInjector {
        const container = new Container();
        container.bind(ILogger).toConstantValue(new MockLogger());
        container.bind(BundledResourceProvider).toConstantValue({
            resolveExternalPath: async (resourcePath: string) => {
                requestedPath = resourcePath;
                return externalRoot;
            }
        });
        container.bind(ShellIntegrationInjector).toSelf().inSingletonScope();
        return container.get(ShellIntegrationInjector);
    }

    it('resolves the bundled scripts to a location that shells can read', () => {
        expect(requestedPath).to.equal(path.join(__dirname, 'shell-integrations'));
    });

    it('passes the resolved bash script to bash', () => {
        const options = injector.injectShellIntegration({ shell: '/bin/bash', args: ['--login'] });
        expect(options.args).to.deep.equal(['--rcfile', path.join(externalRoot, 'bash', 'bash-integration.bash')]);
    });

    it('points zsh at the resolved script directories', () => {
        const options = injector.injectShellIntegration({ shell: '/bin/zsh' });
        expect(options.env?.ZDOTDIR).to.equal(path.join(externalRoot, 'zsh/zdotdir/'));
        expect(options.env?.THEIA_ZSH_DIR).to.equal(path.join(externalRoot, 'zsh'));
    });

    it('leaves the options untouched while the scripts are not available', () => {
        const options = { shell: '/bin/bash', args: ['--login'] };
        expect(createInjector().injectShellIntegration(options)).to.deep.equal(options);
    });

});
