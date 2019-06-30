/********************************************************************************
 * Copyright (C) 2019 David Saunders.
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
/* tslint:disable:no-unused-expression*/
import { expect } from 'chai';
import { VsCodeLocalPluginDeployerResolver } from './plugin-vscode-local-resolver';
import { MockPluginDeployerResolverContext } from '@theia/plugin-ext/lib/common/test/mock-plugin-deployer-resolver-context';

let resolver: VsCodeLocalPluginDeployerResolver;
beforeEach(() => {
    resolver = new VsCodeLocalPluginDeployerResolver();
});

describe('VsCodeLocalPluginDeployerResolver', () => {
    it('should accept the correct commands', () => {
        expect(resolver.accept('ext local /tmp/tst.vsix')).to.be.true;
        expect(resolver.accept('vscode:local//tmp/tst.vsix')).to.be.true;
    });

    it('should reject incorrect commands', () => {
        expect(resolver.accept('ext install /tmp/tst.vsix')).to.be.false;
        expect(resolver.accept('vscode:extension//tmp/tst.vsix')).to.be.false;
    });

    it('should allow an install of a plugin', done => {
        const t: MockPluginDeployerResolverContext = new MockPluginDeployerResolverContext('ext local /tmp/tst.vsix');

        resolver.resolve(t).then(() => {
            expect(true).to.be.true;
            done();
        });
    });

    it('should fail to install an incorrect plugin', done => {
        const t: MockPluginDeployerResolverContext = new MockPluginDeployerResolverContext('ext install /tmp/tst.vsix');

        resolver.resolve(t).catch(() => {
            expect(true).to.be.true;
            done();
        });
    });
});
