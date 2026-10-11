// *****************************************************************************
// Copyright (C) 2026 Tom Aviv.
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
import SshConfig from 'ssh-config';
import { RemoteSSHConnectionProviderImpl } from './remote-ssh-connection-provider';

/**
 * Parses the SSH config from an in-memory string instead of a file,
 * so tests don't need to touch the file system.
 */
class TestableRemoteSSHConnectionProvider extends RemoteSSHConnectionProviderImpl {
    configContent = '';

    override async doGetSSHConfig(): Promise<SshConfig> {
        return SshConfig.parse(this.configContent);
    }
}

describe('RemoteSSHConnectionProviderImpl#matchSSHConfigHost', () => {

    function createProvider(configContent: string): TestableRemoteSSHConnectionProvider {
        const provider = new TestableRemoteSSHConnectionProvider();
        provider.configContent = configContent;
        return provider;
    }

    it('should match a single-pattern host entry and expand %h', async () => {
        const provider = createProvider(`Host my-*
    HostName %h.example.com
`);
        const record = await provider.matchSSHConfigHost('my-server');
        expect(record?.hostname).to.equal('server.example.com');
    });

    it('should replace the host pattern with the concrete host on match', async () => {
        const provider = createProvider(`Host my-*
    Port 2200
`);
        const record = await provider.matchSSHConfigHost('my-server');
        expect(record?.host).to.equal('my-server');
    });

    it('should handle a multi-pattern host entry (host as string array)', async () => {
        const provider = createProvider(`Host web-* db-*
    Port 2022
`);
        const record = await provider.matchSSHConfigHost('web-1');
        expect(record?.host).to.equal('web-1');
        expect(record?.port).to.equal('2022');
    });

    it('should match against subsequent patterns of a multi-pattern host entry', async () => {
        const provider = createProvider(`Host web-* db-*
    HostName %h.cluster.local
`);
        const record = await provider.matchSSHConfigHost('db-3');
        expect(record?.host).to.equal('db-3');
        expect(record?.hostname).to.equal('3.cluster.local');
    });

    it('should match a non-glob host entry', async () => {
        const provider = createProvider(`Host build-server
    HostName 192.168.1.10
`);
        const record = await provider.matchSSHConfigHost('build-server');
        expect(record?.host).to.equal('build-server');
        expect(record?.hostname).to.equal('192.168.1.10');
    });

    it('should match a multi-pattern host entry with non-glob values', async () => {
        const provider = createProvider(`Host alpha beta
    Port 2022
`);
        const first = await provider.matchSSHConfigHost('alpha');
        expect(first?.host).to.equal('alpha');
        expect(first?.port).to.equal('2022');

        const second = await provider.matchSSHConfigHost('beta');
        expect(second?.host).to.equal('beta');
        expect(second?.port).to.equal('2022');
    });

    it('should expand ? wildcards', async () => {
        const provider = createProvider(`Host server-??
    HostName %h.internal
`);
        const record = await provider.matchSSHConfigHost('server-01');
        expect(record?.host).to.equal('server-01');
        expect(record?.hostname).to.equal('01.internal');
    });

    it('should apply the port from the host string', async () => {
        const provider = createProvider(`Host my-*
    HostName %h.example.com
`);
        const record = await provider.matchSSHConfigHost('my-server:2222');
        expect(record?.hostname).to.equal('server.example.com');
        expect(record?.port).to.equal('2222');
    });

    it('should return an empty record when no host entry matches', async () => {
        const provider = createProvider(`Host my-*
    HostName %h.example.com
`);
        const record = await provider.matchSSHConfigHost('other-host');
        expect(record?.host).to.equal(undefined);
        expect(record?.hostname).to.equal(undefined);
    });

    it('should return an empty record for an empty config', async () => {
        const provider = createProvider('');
        const record = await provider.matchSSHConfigHost('any-host');
        expect(record).to.deep.equal({});
    });
});
