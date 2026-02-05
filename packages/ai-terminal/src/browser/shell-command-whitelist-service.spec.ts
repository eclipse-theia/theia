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
import * as sinon from 'sinon';
import { ShellCommandWhitelistService } from './shell-command-whitelist-service';
import { SHELL_COMMAND_WHITELIST_PREFERENCE } from '../common/shell-command-preferences';
import { PreferenceService } from '@theia/core/lib/common/preferences';
import { DefaultShellCommandAnalyzer, ShellCommandAnalyzer } from '../common/shell-command-analyzer';

describe('ShellCommandWhitelistService', () => {
    let service: ShellCommandWhitelistService;
    let preferenceServiceMock: sinon.SinonStubbedInstance<PreferenceService>;
    let storedPatterns: string[];

    beforeEach(() => {
        storedPatterns = [];

        preferenceServiceMock = {
            get: sinon.stub().callsFake((key: string, defaultValue: string[]) => {
                if (key === SHELL_COMMAND_WHITELIST_PREFERENCE) {
                    return storedPatterns;
                }
                return defaultValue;
            }),
            updateValue: sinon.stub().callsFake((_key: string, value: string[]) => {
                storedPatterns = value;
                return Promise.resolve();
            })
        } as unknown as sinon.SinonStubbedInstance<PreferenceService>;

        service = new ShellCommandWhitelistService();
        (service as unknown as { preferenceService: PreferenceService }).preferenceService = preferenceServiceMock;
        (service as unknown as { shellCommandAnalyzer: ShellCommandAnalyzer }).shellCommandAnalyzer = new DefaultShellCommandAnalyzer();
    });

    describe('isCommandAllowed', () => {
        it('should return false for empty whitelist', () => {
            storedPatterns = [];
            expect(service.isCommandAllowed('git log')).to.be.false;
        });

        it('should return true for exact match', () => {
            storedPatterns = ['git log'];
            expect(service.isCommandAllowed('git log')).to.be.true;
        });

        it('should return true for prefix match with args', () => {
            storedPatterns = ['git log'];
            expect(service.isCommandAllowed('git log --oneline')).to.be.true;
        });

        it('should return false for no match', () => {
            storedPatterns = ['git log'];
            expect(service.isCommandAllowed('git push')).to.be.false;
        });

        it('should return false for partial word match (word boundary)', () => {
            storedPatterns = ['git log'];
            expect(service.isCommandAllowed('git logger')).to.be.false;
        });

        it('should return false when command does not start with pattern', () => {
            storedPatterns = ['git log'];
            expect(service.isCommandAllowed('sudo git log')).to.be.false;
        });

        it('should return false when not all sub-commands match', () => {
            storedPatterns = ['git log', 'git status'];
            expect(service.isCommandAllowed('git log && git push')).to.be.false;
        });

        it('should return true when all sub-commands match', () => {
            storedPatterns = ['git log', 'git status'];
            expect(service.isCommandAllowed('git log && git status')).to.be.true;
        });

        it('should return false for dangerous patterns even if whitelisted', () => {
            storedPatterns = ['git log'];
            expect(service.isCommandAllowed('git log $(evil)')).to.be.false;
        });

        it('should return false for backtick command substitution', () => {
            storedPatterns = ['git log'];
            expect(service.isCommandAllowed('git log `evil`')).to.be.false;
        });
    });

    describe('matchesPattern', () => {
        it('should match exact pattern', () => {
            expect(service.matchesPattern('git log', 'git log')).to.be.true;
        });

        it('should match pattern with additional args', () => {
            expect(service.matchesPattern('git log --oneline', 'git log')).to.be.true;
        });

        it('should not match partial word', () => {
            expect(service.matchesPattern('git logger', 'git log')).to.be.false;
        });

        it('should not match when pattern is not at start', () => {
            expect(service.matchesPattern('sudo git log', 'git log')).to.be.false;
        });
    });

    describe('getPatterns', () => {
        it('should return current patterns from preferences', () => {
            storedPatterns = ['git log', 'npm test'];
            const patterns = service.getPatterns();
            expect(patterns).to.deep.equal(['git log', 'npm test']);
        });

        it('should return empty array when no patterns configured', () => {
            storedPatterns = [];
            const patterns = service.getPatterns();
            expect(patterns).to.deep.equal([]);
        });
    });

    describe('addPattern', () => {
        it('should reject empty string', () => {
            expect(() => service.addPattern('')).to.throw('Pattern cannot be empty or whitespace-only');
        });

        it('should reject whitespace-only string', () => {
            expect(() => service.addPattern('   ')).to.throw('Pattern cannot be empty or whitespace-only');
        });

        it('should add valid pattern', () => {
            storedPatterns = [];
            service.addPattern('git log');
            expect(preferenceServiceMock.updateValue.calledOnce).to.be.true;
            expect(storedPatterns).to.deep.equal(['git log']);
        });

        it('should trim pattern before adding', () => {
            storedPatterns = [];
            service.addPattern('  git log  ');
            expect(preferenceServiceMock.updateValue.calledOnce).to.be.true;
            expect(storedPatterns).to.deep.equal(['git log']);
        });

        it('should not add duplicate pattern', () => {
            storedPatterns = ['git log'];
            service.addPattern('git log');
            expect(preferenceServiceMock.updateValue.called).to.be.false;
        });
    });

    describe('removePattern', () => {
        it('should remove existing pattern', () => {
            storedPatterns = ['git log', 'npm test'];
            service.removePattern('git log');
            expect(preferenceServiceMock.updateValue.calledOnce).to.be.true;
            expect(storedPatterns).to.deep.equal(['npm test']);
        });

        it('should not call updateValue when pattern does not exist', () => {
            storedPatterns = ['git log'];
            service.removePattern('npm test');
            expect(preferenceServiceMock.updateValue.called).to.be.false;
        });
    });
});
