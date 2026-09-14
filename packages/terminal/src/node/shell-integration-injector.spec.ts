// *****************************************************************************
// Copyright (C) 2026 Kaan Çelebi and others.
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
import { ShellIntegrationInjector } from './shell-integration-injector';

class TestShellIntegrationInjector extends ShellIntegrationInjector {
    override toUnpackedAsarPath(filePath: string): string {
        return super.toUnpackedAsarPath(filePath);
    }
}

describe('ShellIntegrationInjector', () => {

    const injector = new TestShellIntegrationInjector();

    describe('toUnpackedAsarPath', () => {

        it('keeps paths outside of an asar archive unchanged', () => {
            expect(injector.toUnpackedAsarPath('/opt/app/lib/backend/shell-integrations/bash/bash-integration.bash'))
                .to.equal('/opt/app/lib/backend/shell-integrations/bash/bash-integration.bash');
        });

        it('points to `app.asar.unpacked` when the application is packaged into an asar archive', () => {
            expect(injector.toUnpackedAsarPath('/opt/app/resources/app.asar/lib/backend/shell-integrations/zsh'))
                .to.equal('/opt/app/resources/app.asar.unpacked/lib/backend/shell-integrations/zsh');
            expect(injector.toUnpackedAsarPath('C:\\app\\resources\\app.asar\\lib\\backend\\shell-integrations\\zsh'))
                .to.equal('C:\\app\\resources\\app.asar.unpacked\\lib\\backend\\shell-integrations\\zsh');
        });

        it('does not rewrite a path that already points to `app.asar.unpacked`', () => {
            expect(injector.toUnpackedAsarPath('/opt/app/resources/app.asar.unpacked/lib/backend/shell-integrations/zsh'))
                .to.equal('/opt/app/resources/app.asar.unpacked/lib/backend/shell-integrations/zsh');
        });
    });
});
