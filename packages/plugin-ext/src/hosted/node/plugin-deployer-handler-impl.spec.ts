// *****************************************************************************
// Copyright (C) 2026 Safi Seid-Ahmad, K2view and others.
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
import { DeployedPlugin, PluginIdentifiers } from '../../common/plugin-protocol';
import { PluginDeployerHandlerImpl } from './plugin-deployer-handler-impl';

describe('PluginDeployerHandlerImpl', () => {

    describe('getDeployedPluginsById', () => {

        function createHandler(...plugins: DeployedPlugin[]): PluginDeployerHandlerImpl {
            const handler = new PluginDeployerHandlerImpl();
            for (const plugin of plugins) {
                handler['deployedBackendPlugins'].set(PluginIdentifiers.componentsToVersionedId(plugin.metadata.model), plugin);
            }
            return handler;
        }

        function deployedPlugin(publisher: string, name: string, version: string): DeployedPlugin {
            return { metadata: { model: { publisher, name, version } } } as DeployedPlugin;
        }

        it('matches the id of a deployed plugin', () => {
            const plugin = deployedPlugin('redhat', 'java', '1.57.0');

            expect(createHandler(plugin).getDeployedPluginsById('redhat.java')).to.deep.equal([plugin]);
        });

        it('matches ids case-insensitively, as dependency ids are lower-cased', () => {
            const plugin = deployedPlugin('Dart-Code', 'dart-code', '3.100.0');

            expect(createHandler(plugin).getDeployedPluginsById('dart-code.dart-code')).to.deep.equal([plugin]);
            expect(createHandler(plugin).getDeployedPluginsById('Dart-Code.Dart-Code')).to.deep.equal([plugin]);
        });

        it('does not match other plugins', () => {
            expect(createHandler(deployedPlugin('redhat', 'java', '1.57.0')).getDeployedPluginsById('redhat.javascript')).to.be.empty;
        });
    });
});
