// *****************************************************************************
// Copyright (C) 2026 Matthew Farrow and others.
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
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LocalDirectoryPluginDeployerResolver } from './local-directory-plugin-deployer-resolver';
import { PluginDeployerResolverContext } from '../../../common/plugin-protocol';

describe('LocalDirectoryPluginDeployerResolver', () => {

    let localPath: string;
    let deployed: Map<string, string>;

    beforeEach(() => {
        localPath = fs.mkdtempSync(path.join(os.tmpdir(), 'theia-local-dir-'));
        deployed = new Map();
    });

    afterEach(() => {
        fs.rmSync(localPath, { recursive: true, force: true });
    });

    function createContext(): PluginDeployerResolverContext {
        return {
            getOriginId: () => `${LocalDirectoryPluginDeployerResolver.LOCAL_DIR}:${localPath}`,
            addPlugin: (pluginId: string, pluginPath: string) => {
                deployed.set(pluginId, pluginPath);
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any as PluginDeployerResolverContext;
    }

    it('should skip files that are not plugins', async () => {
        fs.mkdirSync(path.join(localPath, 'my.plugin'));
        fs.writeFileSync(path.join(localPath, 'my-other.plugin.vsix'), '');
        fs.writeFileSync(path.join(localPath, '.DS_Store'), '');
        fs.writeFileSync(path.join(localPath, '._my.plugin'), '');
        fs.writeFileSync(path.join(localPath, 'Thumbs.db'), '');
        fs.writeFileSync(path.join(localPath, 'desktop.ini'), '');

        await new LocalDirectoryPluginDeployerResolver().resolve(createContext());

        expect([...deployed.keys()].sort()).to.deep.equal(['my-other.plugin.vsix', 'my.plugin']);
        expect(deployed.get('my.plugin')).to.equal(path.resolve(localPath, 'my.plugin'));
    });
});
