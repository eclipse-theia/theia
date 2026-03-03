// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { Message } from '@theia/core/lib/common';
import { NotificationManager } from './notifications-manager';
import { NotificationPreferences } from '../common/notification-preferences';
import { NotificationContentRenderer } from './notification-content-renderer';

disableJSDOM();

describe('NotificationManager', () => {

    const DEFAULT_TIMEOUT = 30000;

    class TestableNotificationManager extends NotificationManager {
        public testGetTimeout(plainMessage: Message): number {
            return this.getTimeout(plainMessage);
        }
    }

    function createNotificationManager(preferenceTimeout: number = DEFAULT_TIMEOUT): TestableNotificationManager {
        const manager = new TestableNotificationManager();
        (manager as unknown as { preferences: Partial<NotificationPreferences> }).preferences = {
            'notification.timeout': preferenceTimeout
        };
        (manager as unknown as { contentRenderer: NotificationContentRenderer }).contentRenderer = new NotificationContentRenderer();
        return manager;
    }

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    describe('getTimeout', () => {

        let manager: TestableNotificationManager = createNotificationManager();

        it('should return preference timeout when no options are provided', () => {
            const message: Message = { text: 'Test message' };
            expect(manager.testGetTimeout(message)).to.equal(DEFAULT_TIMEOUT);
        });

        it('should return preference timeout when options are provided without timeout', () => {
            const message: Message = { text: 'Test message', options: {} };
            expect(manager.testGetTimeout(message)).to.equal(DEFAULT_TIMEOUT);
        });

        it('should return explicit timeout when provided', () => {
            const message: Message = { text: 'Test message', options: { timeout: 5000 } };
            expect(manager.testGetTimeout(message)).to.equal(5000);
        });

        it('should return 0 when timeout is explicitly set to 0', () => {
            const message: Message = { text: 'Test message', options: { timeout: 0 } };
            expect(manager.testGetTimeout(message)).to.equal(0);
        });

        it('should return 0 when actions are present regardless of timeout', () => {
            const message: Message = { text: 'Test message', actions: ['OK'], options: { timeout: 5000 } };
            expect(manager.testGetTimeout(message)).to.equal(0);
        });

        it('should return 0 when actions are present and no timeout is set', () => {
            const message: Message = { text: 'Test message', actions: ['OK', 'Cancel'] };
            expect(manager.testGetTimeout(message)).to.equal(0);
        });

        it('should return negative timeout when explicitly set', () => {
            const message: Message = { text: 'Test message', options: { timeout: -1 } };
            expect(manager.testGetTimeout(message)).to.equal(-1);
        });

        it('should return explicit timeout even if custom preference timeout is available', () => {
            const customTimeout = 60000;
            manager = createNotificationManager(customTimeout);
            const message: Message = { text: 'Test message', options: { timeout: 5000 } };
            expect(manager.testGetTimeout(message)).to.equal(5000);
        });

        it('should return custom preference timeout if no timeout is set', () => {
            const customTimeout = 60000;
            manager = createNotificationManager(customTimeout);
            const message: Message = { text: 'Test message' };
            expect(manager.testGetTimeout(message)).to.equal(customTimeout);
        });

    });

});
