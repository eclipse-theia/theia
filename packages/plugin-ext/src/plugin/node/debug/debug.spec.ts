/********************************************************************************
 * Copyright (C) 2022 STMicroelectronics and others.
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
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
 ********************************************************************************/
import { Container } from '@theia/core/shared/inversify';
import { DebugSession } from '@theia/plugin';
import * as chai from 'chai';
import { DebugConfigurationProviderTriggerKind } from '../../../common/plugin-api-rpc';
import { ProxyIdentifier, RPCProtocol } from '../../../common/rpc-protocol';

import { DebugExtImpl } from '../../debug/debug-ext';
import { URI } from '../../types-impl';
import { WorkspaceExtImpl } from '../../workspace';

const expect = chai.expect;

describe('Debug API', () => {

    describe('#asDebugSourceURI', () => {

        const mockRPCProtocol: RPCProtocol = {
            getProxy<T>(_proxyId: ProxyIdentifier<T>): T {
                return {} as T;
            },
            set<T, R extends T>(_id: ProxyIdentifier<T>, instance: R): R {
                return instance;
            },
            dispose(): void {
                // Nothing
            }
        };

        const container = new Container();
        container.bind(RPCProtocol).toConstantValue(mockRPCProtocol);
        container.bind(WorkspaceExtImpl).toConstantValue({} as WorkspaceExtImpl);
        container.bind(DebugExtImpl).toSelf().inSingletonScope();
        const debug = container.get(DebugExtImpl);

        it('should use sourceReference, path and sessionId', () => {
            const source = {
                sourceReference: 3,
                path: 'test/path'
            };
            const session = { id: 'test-session' } as DebugSession;
            const uri = debug.asDebugSourceUri(source, session);
            expect(uri.toString(true)).to.be.equal('debug:test/path?ref=3&session=test-session');
        });

        it('should use sourceReference', () => {
            const source = {
                sourceReference: 5
            };
            const uri = debug.asDebugSourceUri(source);
            expect(uri.toString(true)).to.be.equal('debug:?ref=5');
        });

        it('should use sourceReference and session', () => {
            const source = {
                sourceReference: 5
            };
            const session = { id: 'test-session' } as DebugSession;
            const uri = debug.asDebugSourceUri(source, session);
            expect(uri.toString(true)).to.be.equal('debug:?ref=5&session=test-session');
        });

        it('should use sourceReference and path', () => {
            const source = {
                sourceReference: 4,
                path: 'test/path'
            };
            const uri = debug.asDebugSourceUri(source);
            expect(uri.toString(true)).to.be.equal('debug:test/path?ref=4');
        });

        it('should use path', () => {
            const source = {
                path: 'scheme:/full/path'
            };
            const uri = debug.asDebugSourceUri(source);
            expect(uri.toString(true)).to.be.equal('scheme:/full/path');
        });

        it('should use file path', () => {
            const source = {
                path: '/full/path'
            };
            const uri = debug.asDebugSourceUri(source);
            expect(uri.toString(true)).to.be.equal('file:///full/path');
        });
    });

    describe('workspace folders', () => {

        const backend = URI.parse('file:///project/backend');
        const frontend = URI.parse('file:///project/frontend');
        const workspaceFolders = [{ uri: backend, name: 'API Server', index: 0 }, { uri: frontend, name: 'frontend', index: 1 }];

        const createDebug = (): DebugExtImpl => {
            const noopProxy = new Proxy({}, { get: () => () => { } });
            const mockRPCProtocol = {
                getProxy: () => noopProxy,
                set: <T, R extends T>(_id: ProxyIdentifier<T>, instance: R): R => instance,
                dispose: () => { }
            } as unknown as RPCProtocol;
            const container = new Container();
            container.bind(RPCProtocol).toConstantValue(mockRPCProtocol);
            container.bind(WorkspaceExtImpl).toConstantValue({
                resolveWorkspaceFolder: (uri: URI) => workspaceFolders.find(folder => folder.uri.toString() === uri.toString())
            } as WorkspaceExtImpl);
            container.bind(DebugExtImpl).toSelf().inSingletonScope();
            return container.get(DebugExtImpl);
        };

        it('should pass the workspace folder from the workspace to configuration providers', async () => {
            const debug = createDebug();
            const folders: unknown[] = [];
            debug.registerDebugConfigurationProvider('node', {
                resolveDebugConfiguration: (folder, configuration) => {
                    folders.push(folder);
                    return configuration;
                }
            }, DebugConfigurationProviderTriggerKind.Initial);
            await debug.$resolveDebugConfigurationByHandle(0, frontend.toString(), { type: 'node', name: 'Launch', request: 'launch' });
            expect(folders).to.have.length(1);
            expect(folders[0]).to.equal(workspaceFolders[1]);
        });

        it('should pass no folder for a URI that is not a workspace folder', async () => {
            const debug = createDebug();
            const folders: unknown[] = [];
            debug.registerDebugConfigurationProvider('node', {
                resolveDebugConfiguration: (folder, configuration) => {
                    folders.push(folder);
                    return configuration;
                }
            }, DebugConfigurationProviderTriggerKind.Initial);
            await debug.$resolveDebugConfigurationByHandle(0, 'file:///other/shared', { type: 'node', name: 'Launch', request: 'launch' });
            expect(folders).to.deep.equal([undefined]);
        });
    });
});
