// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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
import { sanitizeMCPName } from './mcp-utils';

describe('sanitizeMCPName', () => {

    it('should replace spaces with underscores', () => {
        expect(sanitizeMCPName('My server')).to.equal('My_server');
        expect(sanitizeMCPName('My Server Name')).to.equal('My_Server_Name');
    });

    it('should remove special characters', () => {
        expect(sanitizeMCPName('My@Server!')).to.equal('MyServer');
        expect(sanitizeMCPName('Server#123')).to.equal('Server123');
        expect(sanitizeMCPName('test$%^&*()')).to.equal('test');
    });

    it('should preserve alphanumeric characters', () => {
        expect(sanitizeMCPName('Server123')).to.equal('Server123');
        expect(sanitizeMCPName('ABC123xyz')).to.equal('ABC123xyz');
    });

    it('should preserve underscores and hyphens', () => {
        expect(sanitizeMCPName('my_server')).to.equal('my_server');
        expect(sanitizeMCPName('my-server')).to.equal('my-server');
        expect(sanitizeMCPName('my_server-name')).to.equal('my_server-name');
    });

    it('should handle mixed cases', () => {
        expect(sanitizeMCPName('My Server 123!')).to.equal('My_Server_123');
        expect(sanitizeMCPName('Test@Server#Name')).to.equal('TestServerName');
        expect(sanitizeMCPName('My-Server Name_123')).to.equal('My-Server_Name_123');
    });

    it('should handle empty string', () => {
        expect(sanitizeMCPName('')).to.equal('');
    });

    it('should handle string with only special characters', () => {
        expect(sanitizeMCPName('!@#$%^&*()')).to.equal('');
    });

    it('should handle string with only spaces', () => {
        expect(sanitizeMCPName('   ')).to.equal('');
    });

    it('should handle multiple consecutive spaces', () => {
        expect(sanitizeMCPName('My  Server')).to.equal('My__Server');
        expect(sanitizeMCPName('My   Server   Name')).to.equal('My___Server___Name');
    });
});
