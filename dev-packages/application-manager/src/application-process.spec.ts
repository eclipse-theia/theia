// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
import { ApplicationProcess } from './application-process';
import { ApplicationPackage } from '@theia/application-package';

describe('ApplicationProcess', () => {

    function createProcess(): ApplicationProcess {
        // Only `projectPath` is needed for `spawn`'s working directory.
        const pck = { projectPath: process.cwd() } as ApplicationPackage;
        return new ApplicationProcess(pck, '');
    }

    it('should pass arguments containing spaces and shell metacharacters through intact', async () => {
        const applicationProcess = createProcess();
        const testArgs = ['hello world', 'a&b', 'c;d', 'quote"inside'];
        // Print each received argument on its own line so we can compare with the input.
        const script = 'process.stdout.write(process.argv.slice(1).join(String.fromCharCode(10)))';

        const child = applicationProcess.spawn(process.execPath, ['-e', script, ...testArgs]);
        let stdout = '';
        child.stdout!.on('data', data => stdout += data.toString());

        await new Promise<void>((resolve, reject) => {
            child.on('error', reject);
            child.on('close', () => resolve());
        });

        expect(stdout).to.equal(testArgs.join('\n'));
    });
});
