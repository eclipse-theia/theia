// *****************************************************************************
// Copyright (C) 2026 Yash Kakade and others.
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
import * as os from 'os';
import * as path from 'path';
import * as fs from '@theia/core/shared/fs-extra';
import * as sinon from 'sinon';
import { DeployedPlugin, PluginIdentifiers, PluginType } from '../../common/plugin-protocol.js';
import { PluginDeployerHandlerImpl } from './plugin-deployer-handler-impl.js';

describe('PluginDeployerHandlerImpl', () => {

    let tmpDir: string;
    let handler: PluginDeployerHandlerImpl;
    let uninstalled: string[];

    function deploy(id: PluginIdentifiers.VersionedId, type: PluginType): string {
        const location = path.join(tmpDir, id);
        fs.ensureDirSync(location);
        const internals = handler as unknown as {
            deployedBackendPlugins: Map<string, DeployedPlugin>;
            sourceLocations: Map<string, Set<string>>;
        };
        internals.deployedBackendPlugins.set(id, { type, metadata: { model: PluginIdentifiers.idAndVersionFromVersionedId(id) } } as unknown as DeployedPlugin);
        internals.sourceLocations.set(id, new Set([location]));
        return location;
    }

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plugin-deployer-handler-'));
        uninstalled = [];
        handler = new PluginDeployerHandlerImpl();
        Object.assign(handler, {
            logger: { error: () => { } },
            localizationService: { undeployLocalizations: () => { } },
            uninstallationManager: {
                markAsUninstalled: (...ids: string[]) => uninstalled.push(...ids),
                markAsInstalled: () => { }
            }
        });
    });

    afterEach(() => fs.remove(tmpDir));

    it('removes the source of a user extension when it uninstalls it', async () => {
        const location = deploy('foo.bar@1.0.0', PluginType.User);
        expect(await handler.uninstallPlugin('foo.bar@1.0.0')).to.equal(true);
        expect(await fs.pathExists(location)).to.equal(false);
        expect(uninstalled).to.deep.equal(['foo.bar@1.0.0']);
    });

    it('keeps the source of a built-in extension when it uninstalls it', async () => {
        const builtIn = deploy('foo.bar@1.0.0', PluginType.System);
        expect(await handler.uninstallPlugin('foo.bar@1.0.0')).to.equal(true);
        expect(await fs.pathExists(builtIn)).to.equal(true);
        expect(uninstalled).to.deep.equal(['foo.bar@1.0.0']);
    });

    it('uninstalls a built-in extension when a user extension with another version is deployed, and keeps its source', async () => {
        const builtIn = deploy('foo.bar@1.0.0', PluginType.System);
        deploy('foo.bar@2.0.0', PluginType.User);
        const uninstall = sinon.spy(handler, 'uninstallPlugin');
        (handler as unknown as { markAsInstalled(id: string): void }).markAsInstalled('foo.bar@2.0.0');
        await Promise.all(uninstall.returnValues);
        expect(uninstall.args).to.deep.equal([['foo.bar@1.0.0']]);
        expect(await fs.pathExists(builtIn)).to.equal(true);
    });
});
