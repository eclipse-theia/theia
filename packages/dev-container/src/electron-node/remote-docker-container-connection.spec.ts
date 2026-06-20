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
import { RemoteDockerContainerConnection } from './remote-docker-container-connection';
import { DevContainerConfiguration } from './devcontainer-file';
import { ILogger } from '@theia/core';
import * as Docker from 'dockerode';

class TestableDockerContainerConnection extends RemoteDockerContainerConnection {
    public testGetRemoteEnv(): string[] | undefined {
        return this.getRemoteEnv();
    }
    public testBuildShellCommand(cmd: string, args?: string[]): string {
        return this.buildShellCommand(cmd, args);
    }
}

function createConnection(config: DevContainerConfiguration): TestableDockerContainerConnection {
    const mockDocker = {
        getEvents: () => Promise.resolve({ on: () => { }, destroy: () => { } })
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

            expect(connection.testGetRemoteEnv()).to.be.undefined;
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

    describe('buildShellCommand', () => {

        it('should return cmd unchanged when no args are provided', () => {
            const connection = createConnection({ image: 'test' } as DevContainerConfiguration);
            expect(connection.testBuildShellCommand('echo')).to.equal('echo');
            expect(connection.testBuildShellCommand('echo', [])).to.equal('echo');
        });

        it('should strong-quote arguments to prevent shell expansion', () => {
            const connection = createConnection({ image: 'test' } as DevContainerConfiguration);
            expect(connection.testBuildShellCommand('echo', ['hello world'])).to.equal("echo 'hello world'");
        });

        it('should handle arguments with dollar signs', () => {
            const connection = createConnection({ image: 'test' } as DevContainerConfiguration);
            expect(connection.testBuildShellCommand('echo', ['$HOME'])).to.equal("echo '$HOME'");
        });

        it('should handle arguments with backticks', () => {
            const connection = createConnection({ image: 'test' } as DevContainerConfiguration);
            expect(connection.testBuildShellCommand('echo', ['`whoami`'])).to.equal("echo '`whoami`'");
        });

        it('should handle arguments with single quotes', () => {
            const connection = createConnection({ image: 'test' } as DevContainerConfiguration);
            // Single quotes inside strong-quoted strings are handled by breaking out and using double-quoted quote
            expect(connection.testBuildShellCommand('echo', ["it's"])).to.equal('echo \'it\'"\'"\'s\'');
        });

        it('should handle arguments with double quotes', () => {
            const connection = createConnection({ image: 'test' } as DevContainerConfiguration);
            expect(connection.testBuildShellCommand('echo', ['say "hi"'])).to.equal("echo 'say \"hi\"'");
        });

        it('should handle multiple arguments', () => {
            const connection = createConnection({ image: 'test' } as DevContainerConfiguration);
            expect(connection.testBuildShellCommand('node', ['server.js', '--port=8080'])).to.equal("node 'server.js' '--port=8080'");
        });

        it('should handle arguments with newlines', () => {
            const connection = createConnection({ image: 'test' } as DevContainerConfiguration);
            const result = connection.testBuildShellCommand('echo', ['line1\nline2']);
            // Literal newline is preserved inside single quotes
            expect(result).to.equal("echo 'line1\nline2'");
        });
    });

    describe('shutdownContainer', () => {

        function createConnectionWithConfig(config: Partial<DevContainerConfiguration>): { connection: RemoteDockerContainerConnection; stopCalled: () => boolean } {
            const state = { stopCalled: false };
            const mockDocker = {
                getEvents: () => Promise.resolve({ on: () => { }, destroy: () => { } })
            } as unknown as Docker;
            const mockContainer = {
                id: 'test-container-id',
                stop: () => { state.stopCalled = true; return Promise.resolve(); }
            } as unknown as Docker.Container;
            const mockLogger = {} as ILogger;
            const connection = new RemoteDockerContainerConnection({
                id: 'test-id',
                name: 'test',
                type: 'Dev Container',
                docker: mockDocker,
                container: mockContainer,
                config: config as DevContainerConfiguration,
                logger: mockLogger
            });
            return { connection, stopCalled: () => state.stopCalled };
        }

        it('should not stop container when shutdownAction is none', async () => {
            const { connection, stopCalled } = createConnectionWithConfig({ shutdownAction: 'none' });
            await connection.dispose();
            expect(stopCalled()).to.equal(false);
        });

        it('should stop container when shutdownAction is stopContainer', async () => {
            const { connection, stopCalled } = createConnectionWithConfig({ shutdownAction: 'stopContainer' });
            await connection.dispose();
            expect(stopCalled()).to.equal(true);
        });

        it('should default to stopContainer when shutdownAction is not set and no dockerComposeFile', async () => {
            const { connection, stopCalled } = createConnectionWithConfig({});
            await connection.dispose();
            expect(stopCalled()).to.equal(true);
        });

        it('should not stop container when shutdownAction is none even with dockerComposeFile', async () => {
            const { connection, stopCalled } = createConnectionWithConfig({
                shutdownAction: 'none',
                dockerComposeFile: 'docker-compose.yml'
            });
            await connection.dispose();
            expect(stopCalled()).to.equal(false);
        });
    });
});
