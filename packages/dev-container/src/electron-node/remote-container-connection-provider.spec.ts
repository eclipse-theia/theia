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
import { RemoteDockerContainerConnection } from './remote-container-connection-provider';
import { DevContainerConfiguration } from './devcontainer-file';
import { ILogger } from '@theia/core';
import * as Docker from 'dockerode';

class TestableDockerContainerConnection extends RemoteDockerContainerConnection {
    public testGetRemoteEnv(): string[] | undefined {
        return this.getRemoteEnv();
    }
}

function createConnection(config: DevContainerConfiguration): TestableDockerContainerConnection {
    const mockDocker = {
        getEvents: () => Promise.resolve({ on: () => { } })
    } as unknown as Docker;
    const mockContainer = {} as unknown as Docker.Container;
    const mockLogger = {} as ILogger;
    return new TestableDockerContainerConnection({
        id: 'test-id',
        name: 'test',
        type: 'Dev Container',
        docker: mockDocker,
        container: mockContainer,
        config,
        logger: mockLogger
    });
}

describe('RemoteDockerContainerConnection', () => {

    describe('getRemoteEnv', () => {

        it('should return undefined when remoteEnv is not set', () => {
            const connection = createConnection({
                image: 'test'
            } as DevContainerConfiguration);

            expect(connection.testGetRemoteEnv()).to.be.undefined;
        });

        it('should return undefined when remoteEnv is empty', () => {
            const connection = createConnection({
                image: 'test',
                remoteEnv: {}
            } as DevContainerConfiguration);

            expect(connection.testGetRemoteEnv()).to.be.undefined;
        });

        it('should convert remoteEnv entries to KEY=value format', () => {
            const connection = createConnection({
                image: 'test',
                remoteEnv: {
                    'MY_VAR': 'my_value',
                    'ANOTHER_VAR': 'another_value'
                }
            } as DevContainerConfiguration);

            const env = connection.testGetRemoteEnv();
            expect(env).to.have.lengthOf(2);
            expect(env).to.include('MY_VAR=my_value');
            expect(env).to.include('ANOTHER_VAR=another_value');
        });

        it('should filter out entries with undefined values', () => {
            const connection = createConnection({
                image: 'test',
                remoteEnv: {
                    'KEEP_VAR': 'value',
                    'REMOVE_VAR': undefined
                }
            } as DevContainerConfiguration);

            const env = connection.testGetRemoteEnv();
            expect(env).to.have.lengthOf(1);
            expect(env).to.include('KEEP_VAR=value');
        });

        it('should return undefined when all entries have undefined values', () => {
            const connection = createConnection({
                image: 'test',
                remoteEnv: {
                    'VAR1': undefined,
                    'VAR2': undefined
                }
            } as DevContainerConfiguration);

            const env = connection.testGetRemoteEnv();
            expect(env).to.have.lengthOf(0);
        });

        it('should handle values containing equals signs', () => {
            const connection = createConnection({
                image: 'test',
                remoteEnv: {
                    'CONNECTION_STRING': 'host=localhost;port=5432'
                }
            } as DevContainerConfiguration);

            const env = connection.testGetRemoteEnv();
            expect(env).to.have.lengthOf(1);
            expect(env).to.include('CONNECTION_STRING=host=localhost;port=5432');
        });

        it('should handle empty string values', () => {
            const connection = createConnection({
                image: 'test',
                remoteEnv: {
                    'EMPTY_VAR': ''
                }
            } as DevContainerConfiguration);

            const env = connection.testGetRemoteEnv();
            expect(env).to.have.lengthOf(1);
            expect(env).to.include('EMPTY_VAR=');
        });

        it('should handle values with special characters', () => {
            const connection = createConnection({
                image: 'test',
                remoteEnv: {
                    'PATH_EXTRA': '/usr/local/bin:/custom/path',
                    'QUOTED': 'hello "world"',
                    'SPACED': 'hello world'
                }
            } as DevContainerConfiguration);

            const env = connection.testGetRemoteEnv();
            expect(env).to.have.lengthOf(3);
            expect(env).to.include('PATH_EXTRA=/usr/local/bin:/custom/path');
            expect(env).to.include('QUOTED=hello "world"');
            expect(env).to.include('SPACED=hello world');
        });
    });
});
