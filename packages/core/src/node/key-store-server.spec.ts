// *****************************************************************************
// Copyright (C) 2025 STMicroelectronics and others.
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
import { KeyStoreServiceImpl, InMemoryCredentialsProvider } from './key-store-server';

describe('KeyStoreServiceImpl', () => {
    let keyStoreService: KeyStoreServiceImpl;
    let inMemoryProvider: InMemoryCredentialsProvider;

    beforeEach(() => {
        keyStoreService = new KeyStoreServiceImpl();
        inMemoryProvider = new InMemoryCredentialsProvider();
        // Force the service to use the in-memory provider for testing
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (keyStoreService as any).keytarImplementation = inMemoryProvider;
    });

    describe('keys', () => {
        it('should return an empty array when no credentials exist for the service', async () => {
            const result = await keyStoreService.keys('test-service');
            expect(result).to.be.an('array');
            expect(result).to.be.empty;
        });

        it('should return a single account key when one credential exists', async () => {
            await keyStoreService.setPassword('test-service', 'account1', 'password1');
            const result = await keyStoreService.keys('test-service');
            expect(result).to.deep.equal(['account1']);
        });

        it('should return multiple account keys when multiple credentials exist', async () => {
            await keyStoreService.setPassword('test-service', 'account1', 'password1');
            await keyStoreService.setPassword('test-service', 'account2', 'password2');
            await keyStoreService.setPassword('test-service', 'account3', 'password3');
            const result = await keyStoreService.keys('test-service');
            expect(result).to.have.lengthOf(3);
            expect(result).to.include.members(['account1', 'account2', 'account3']);
        });

        it('should only return keys for the specified service', async () => {
            await keyStoreService.setPassword('service1', 'account1', 'password1');
            await keyStoreService.setPassword('service2', 'account2', 'password2');
            await keyStoreService.setPassword('service1', 'account3', 'password3');

            const result = await keyStoreService.keys('service1');
            expect(result).to.have.lengthOf(2);
            expect(result).to.include.members(['account1', 'account3']);
            expect(result).to.not.include('account2');
        });

        it('should return updated keys after a credential is deleted', async () => {
            await keyStoreService.setPassword('test-service', 'account1', 'password1');
            await keyStoreService.setPassword('test-service', 'account2', 'password2');
            await keyStoreService.deletePassword('test-service', 'account1');

            const result = await keyStoreService.keys('test-service');
            expect(result).to.deep.equal(['account2']);
        });

        it('should return updated keys after a credential password is updated', async () => {
            await keyStoreService.setPassword('test-service', 'account1', 'password1');
            await keyStoreService.setPassword('test-service', 'account1', 'password2');

            const result = await keyStoreService.keys('test-service');
            expect(result).to.deep.equal(['account1']);
        });

        it('should handle services with special characters in the name', async () => {
            const specialService = 'test-service@#$%^&*()';
            await keyStoreService.setPassword(specialService, 'account1', 'password1');

            const result = await keyStoreService.keys(specialService);
            expect(result).to.deep.equal(['account1']);
        });

        it('should handle accounts with special characters in the name', async () => {
            await keyStoreService.setPassword('test-service', 'user@example.com', 'password1');
            await keyStoreService.setPassword('test-service', 'user-name_123', 'password2');

            const result = await keyStoreService.keys('test-service');
            expect(result).to.have.lengthOf(2);
            expect(result).to.include.members(['user@example.com', 'user-name_123']);
        });
    });

    describe('setPassword', () => {
        it('should set a password for an account', async () => {
            await keyStoreService.setPassword('test-service', 'account1', 'password1');
            const password = await keyStoreService.getPassword('test-service', 'account1');
            expect(password).to.equal('password1');
        });

        it('should update an existing password', async () => {
            await keyStoreService.setPassword('test-service', 'account1', 'password1');
            await keyStoreService.setPassword('test-service', 'account1', 'password2');
            const password = await keyStoreService.getPassword('test-service', 'account1');
            expect(password).to.equal('password2');
        });
    });

    describe('getPassword', () => {
        it('should return undefined when password does not exist', async () => {
            const password = await keyStoreService.getPassword('test-service', 'nonexistent');
            expect(password).to.be.undefined;
        });

        it('should retrieve a stored password', async () => {
            await keyStoreService.setPassword('test-service', 'account1', 'password1');
            const password = await keyStoreService.getPassword('test-service', 'account1');
            expect(password).to.equal('password1');
        });
    });

    describe('deletePassword', () => {
        it('should return false when deleting a non-existent password', async () => {
            const result = await keyStoreService.deletePassword('test-service', 'nonexistent');
            expect(result).to.be.false;
        });

        it('should return true when deleting an existing password', async () => {
            await keyStoreService.setPassword('test-service', 'account1', 'password1');
            const result = await keyStoreService.deletePassword('test-service', 'account1');
            expect(result).to.be.true;
        });

        it('should remove the password after deletion', async () => {
            await keyStoreService.setPassword('test-service', 'account1', 'password1');
            await keyStoreService.deletePassword('test-service', 'account1');
            const password = await keyStoreService.getPassword('test-service', 'account1');
            expect(password).to.be.undefined;
        });
    });

    describe('findPassword', () => {
        it('should return undefined when service has no credentials', async () => {
            const result = await keyStoreService.findPassword('nonexistent-service');
            expect(result).to.be.undefined;
        });

        it('should return the service credentials as JSON string', async () => {
            await keyStoreService.setPassword('test-service', 'account1', 'password1');
            const result = await keyStoreService.findPassword('test-service');
            expect(result).to.be.a('string');
        });
    });

    describe('findCredentials', () => {
        it('should return an empty array when no credentials exist', async () => {
            const result = await keyStoreService.findCredentials('test-service');
            expect(result).to.be.an('array');
            expect(result).to.be.empty;
        });

        it('should return all credentials for a service', async () => {
            await keyStoreService.setPassword('test-service', 'account1', 'password1');
            await keyStoreService.setPassword('test-service', 'account2', 'password2');
            const result = await keyStoreService.findCredentials('test-service');
            expect(result).to.have.lengthOf(2);
            expect(result).to.deep.include({ account: 'account1', password: 'password1' });
            expect(result).to.deep.include({ account: 'account2', password: 'password2' });
        });
    });
});

describe('InMemoryCredentialsProvider', () => {
    let provider: InMemoryCredentialsProvider;

    beforeEach(() => {
        provider = new InMemoryCredentialsProvider();
    });

    describe('setPassword and getPassword', () => {
        it('should store and retrieve a password', async () => {
            await provider.setPassword('service1', 'account1', 'password1');
            const result = await provider.getPassword('service1', 'account1');
            expect(result).to.equal('password1');
        });

        it('should return null for non-existent password', async () => {
            const result = await provider.getPassword('service1', 'account1');
            expect(result).to.be.null;
        });
    });

    describe('deletePassword', () => {
        it('should return false when deleting non-existent password', async () => {
            const result = await provider.deletePassword('service1', 'account1');
            expect(result).to.be.false;
        });

        it('should delete an existing password and return true', async () => {
            await provider.setPassword('service1', 'account1', 'password1');
            const result = await provider.deletePassword('service1', 'account1');
            expect(result).to.be.true;
            const password = await provider.getPassword('service1', 'account1');
            expect(password).to.be.null;
        });

        it('should remove service entry when all accounts are deleted', async () => {
            await provider.setPassword('service1', 'account1', 'password1');
            await provider.deletePassword('service1', 'account1');
            const credentials = await provider.findCredentials('service1');
            expect(credentials).to.be.empty;
        });
    });

    describe('findPassword', () => {
        it('should return null for non-existent service', async () => {
            const result = await provider.findPassword('service1');
            expect(result).to.be.null;
        });

        it('should return JSON string of service credentials', async () => {
            await provider.setPassword('service1', 'account1', 'password1');
            const result = await provider.findPassword('service1');
            expect(result).to.be.a('string');
        });
    });

    describe('findCredentials', () => {
        it('should return empty array for non-existent service', async () => {
            const result = await provider.findCredentials('service1');
            expect(result).to.be.an('array');
            expect(result).to.be.empty;
        });

        it('should return all credentials for a service', async () => {
            await provider.setPassword('service1', 'account1', 'password1');
            await provider.setPassword('service1', 'account2', 'password2');
            const result = await provider.findCredentials('service1');
            expect(result).to.have.lengthOf(2);
            expect(result).to.deep.include({ account: 'account1', password: 'password1' });
            expect(result).to.deep.include({ account: 'account2', password: 'password2' });
        });
    });

    describe('clear', () => {
        it('should remove all stored credentials', async () => {
            await provider.setPassword('service1', 'account1', 'password1');
            await provider.setPassword('service2', 'account2', 'password2');
            await provider.clear();
            const credentials1 = await provider.findCredentials('service1');
            const credentials2 = await provider.findCredentials('service2');
            expect(credentials1).to.be.empty;
            expect(credentials2).to.be.empty;
        });
    });
});
