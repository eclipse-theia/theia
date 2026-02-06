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
import { SHELL_COMMAND_WHITELIST_PREFERENCE, SHELL_COMMAND_BLACKLIST_PREFERENCE } from '../common/shell-command-preferences';
import { PreferenceService } from '@theia/core/lib/common/preferences';
import { DefaultShellCommandAnalyzer, ShellCommandAnalyzer } from '../common/shell-command-analyzer';

describe('ShellCommandWhitelistService', () => {
    let service: ShellCommandWhitelistService;
    let preferenceServiceMock: sinon.SinonStubbedInstance<PreferenceService>;
    let storedPatterns: string[];
    let storedBlacklistPatterns: string[];

    beforeEach(() => {
        storedPatterns = [];
        storedBlacklistPatterns = [];

        preferenceServiceMock = {
            get: sinon.stub().callsFake((key: string, defaultValue: string[]) => {
                if (key === SHELL_COMMAND_WHITELIST_PREFERENCE) {
                    return storedPatterns;
                }
                if (key === SHELL_COMMAND_BLACKLIST_PREFERENCE) {
                    return storedBlacklistPatterns;
                }
                return defaultValue;
            }),
            updateValue: sinon.stub().callsFake((key: string, value: string[]) => {
                if (key === SHELL_COMMAND_WHITELIST_PREFERENCE) {
                    storedPatterns = value;
                } else if (key === SHELL_COMMAND_BLACKLIST_PREFERENCE) {
                    storedBlacklistPatterns = value;
                }
                return Promise.resolve();
            })
        } as unknown as sinon.SinonStubbedInstance<PreferenceService>;

        service = new ShellCommandWhitelistService();
        (service as unknown as { preferenceService: PreferenceService }).preferenceService = preferenceServiceMock;
        (service as unknown as { shellCommandAnalyzer: ShellCommandAnalyzer }).shellCommandAnalyzer = new DefaultShellCommandAnalyzer();
    });

    describe('addPattern validation', () => {
        describe('valid patterns', () => {
            it('accepts exact match pattern', () => {
                service.addPattern('git log');
                expect(storedPatterns).to.deep.equal(['git log']);
            });

            it('accepts trailing wildcard with space', () => {
                service.addPattern('git log *');
                expect(storedPatterns).to.deep.equal(['git log *']);
            });

            it('accepts leading wildcard', () => {
                service.addPattern('* --version');
                expect(storedPatterns).to.deep.equal(['* --version']);
            });

            it('accepts middle wildcard', () => {
                service.addPattern('git * main');
                expect(storedPatterns).to.deep.equal(['git * main']);
            });

            it('accepts multiple wildcards with spaces', () => {
                service.addPattern('* * *');
                expect(storedPatterns).to.deep.equal(['* * *']);
            });

            it('trims pattern before adding', () => {
                service.addPattern('  git log  ');
                expect(storedPatterns).to.deep.equal(['git log']);
            });

            it('does not add duplicate pattern', () => {
                storedPatterns = ['git log'];
                service.addPattern('git log');
                expect(preferenceServiceMock.updateValue.called).to.be.false;
            });
        });

        describe('invalid patterns', () => {
            it('rejects empty pattern', () => {
                expect(() => service.addPattern('')).to.throw('Pattern cannot be empty or whitespace-only');
            });

            it('rejects whitespace-only pattern', () => {
                expect(() => service.addPattern('   ')).to.throw('Pattern cannot be empty or whitespace-only');
            });

            it('rejects * alone', () => {
                expect(() => service.addPattern('*')).to.throw(/too permissive/);
            });

            it('rejects wildcard without preceding space: git*', () => {
                expect(() => service.addPattern('git*')).to.throw(/must be preceded by a space/);
            });

            it('rejects wildcard without preceding space: git log*', () => {
                expect(() => service.addPattern('git log*')).to.throw(/must be preceded by a space/);
            });

            it('rejects wildcard in middle without space: git*log', () => {
                expect(() => service.addPattern('git*log')).to.throw(/must be preceded by a space/);
            });

            it('rejects wildcard after non-space: cmd* *', () => {
                expect(() => service.addPattern('cmd* *')).to.throw(/must be preceded by a space/);
            });

            it('rejects double wildcard **', () => {
                expect(() => service.addPattern('git log **')).to.throw(/must be preceded by a space/);
            });

            it('rejects triple wildcard ***', () => {
                expect(() => service.addPattern('git ***')).to.throw(/must be preceded by a space/);
            });
        });
    });

    describe('isCommandAllowed with Claude Code syntax', () => {
        describe('exact match (no wildcard)', () => {
            beforeEach(() => {
                storedPatterns = ['git log'];
            });

            it('matches exact command', () => {
                expect(service.isCommandAllowed('git log')).to.be.true;
            });

            it('does not match with additional args', () => {
                expect(service.isCommandAllowed('git log --oneline')).to.be.false;
            });

            it('does not match partial command', () => {
                expect(service.isCommandAllowed('git')).to.be.false;
            });

            it('does not match extended command', () => {
                expect(service.isCommandAllowed('git logger')).to.be.false;
            });

            it('does not match with prefix', () => {
                expect(service.isCommandAllowed('sudo git log')).to.be.false;
            });
        });

        describe('trailing wildcard: "git log *"', () => {
            beforeEach(() => {
                storedPatterns = ['git log *'];
            });

            it('matches base command without args', () => {
                expect(service.isCommandAllowed('git log')).to.be.true;
            });

            it('matches command with one arg', () => {
                expect(service.isCommandAllowed('git log --oneline')).to.be.true;
            });

            it('matches command with multiple args', () => {
                expect(service.isCommandAllowed('git log --oneline -n 5')).to.be.true;
            });

            it('does not match different base command', () => {
                expect(service.isCommandAllowed('git status')).to.be.false;
            });

            it('does not match partial word extension', () => {
                expect(service.isCommandAllowed('git logger')).to.be.false;
            });

            it('does not match with prefix', () => {
                expect(service.isCommandAllowed('sudo git log')).to.be.false;
            });
        });

        describe('leading wildcard: "* --version"', () => {
            beforeEach(() => {
                storedPatterns = ['* --version'];
            });

            it('matches command ending with --version', () => {
                expect(service.isCommandAllowed('node --version')).to.be.true;
            });

            it('matches different command ending with --version', () => {
                expect(service.isCommandAllowed('npm --version')).to.be.true;
            });

            it('matches complex command ending with --version', () => {
                expect(service.isCommandAllowed('python3 --version')).to.be.true;
            });

            it('does not match --version alone (no prefix)', () => {
                expect(service.isCommandAllowed('--version')).to.be.false;
            });

            it('does not match --version in middle', () => {
                expect(service.isCommandAllowed('node --version extra')).to.be.false;
            });

            it('does not match similar but different suffix', () => {
                expect(service.isCommandAllowed('node --versions')).to.be.false;
            });
        });

        describe('middle wildcard: "git * main"', () => {
            beforeEach(() => {
                storedPatterns = ['git * main'];
            });

            it('matches with checkout', () => {
                expect(service.isCommandAllowed('git checkout main')).to.be.true;
            });

            it('matches with merge', () => {
                expect(service.isCommandAllowed('git merge main')).to.be.true;
            });

            it('matches with switch', () => {
                expect(service.isCommandAllowed('git switch main')).to.be.true;
            });

            it('matches with complex middle', () => {
                expect(service.isCommandAllowed('git checkout -b feature main')).to.be.true;
            });

            it('does not match without middle part', () => {
                expect(service.isCommandAllowed('git main')).to.be.false;
            });

            it('does not match different ending', () => {
                expect(service.isCommandAllowed('git checkout master')).to.be.false;
            });

            it('does not match with prefix', () => {
                expect(service.isCommandAllowed('sudo git checkout main')).to.be.false;
            });
        });

        describe('multiple wildcards: "cmd * * end"', () => {
            beforeEach(() => {
                storedPatterns = ['cmd * * end'];
            });

            it('matches command with required middle parts', () => {
                expect(service.isCommandAllowed('cmd foo bar end')).to.be.true;
            });

            it('matches command with extra middle parts', () => {
                expect(service.isCommandAllowed('cmd foo bar baz end')).to.be.true;
            });

            it('does not match without required ending', () => {
                expect(service.isCommandAllowed('cmd foo bar')).to.be.false;
            });

            it('does not match without required start', () => {
                expect(service.isCommandAllowed('foo bar end')).to.be.false;
            });
        });

        describe('special regex characters in pattern', () => {
            it('matches pattern with quotes literally', () => {
                storedPatterns = ['echo "hello"'];
                expect(service.isCommandAllowed('echo "hello"')).to.be.true;
            });

            it('does not treat quotes as special', () => {
                storedPatterns = ['echo "hello"'];
                expect(service.isCommandAllowed('echo hello')).to.be.false;
            });

            it('matches pattern with plus literally', () => {
                storedPatterns = ['echo a+b'];
                expect(service.isCommandAllowed('echo a+b')).to.be.true;
                expect(service.isCommandAllowed('echo aXb')).to.be.false;
            });

            it('matches pattern with $ literally', () => {
                storedPatterns = ['echo $HOME'];
                expect(service.isCommandAllowed('echo $HOME')).to.be.true;
            });

            it('matches pattern with dot literally', () => {
                storedPatterns = ['cat file.txt'];
                expect(service.isCommandAllowed('cat file.txt')).to.be.true;
                expect(service.isCommandAllowed('cat fileXtxt')).to.be.false;
            });

            it('matches pattern with brackets literally', () => {
                storedPatterns = ['echo [test]'];
                expect(service.isCommandAllowed('echo [test]')).to.be.true;
            });

            it('matches pattern with parentheses literally', () => {
                storedPatterns = ['echo (test)'];
                expect(service.isCommandAllowed('echo (test)')).to.be.true;
            });
        });

        describe('edge cases', () => {
            it('handles multiple spaces in command', () => {
                storedPatterns = ['git log *'];
                // Double space doesn't match - exact pattern requires single space
                expect(service.isCommandAllowed('git  log')).to.be.false;
            });

            it('is case sensitive', () => {
                storedPatterns = ['git log'];
                expect(service.isCommandAllowed('Git Log')).to.be.false;
                expect(service.isCommandAllowed('GIT LOG')).to.be.false;
            });

            it('returns false for empty whitelist', () => {
                storedPatterns = [];
                expect(service.isCommandAllowed('git log')).to.be.false;
            });
        });

        describe('integration with dangerous pattern detection', () => {
            it('blocks command substitution even when pattern matches', () => {
                storedPatterns = ['git log *'];
                expect(service.isCommandAllowed('git log $(whoami)')).to.be.false;
            });

            it('blocks backticks even when pattern matches', () => {
                storedPatterns = ['echo *'];
                expect(service.isCommandAllowed('echo `whoami`')).to.be.false;
            });

            it('blocks subshell even when pattern matches', () => {
                storedPatterns = ['* *'];
                expect(service.isCommandAllowed('(rm -rf /)')).to.be.false;
            });
        });

        describe('combined sub-commands', () => {
            beforeEach(() => {
                storedPatterns = ['git log *', 'git status'];
            });

            it('allows when all sub-commands match', () => {
                expect(service.isCommandAllowed('git log --oneline && git status')).to.be.true;
            });

            it('blocks when any sub-command does not match', () => {
                expect(service.isCommandAllowed('git log --oneline && git push')).to.be.false;
            });
        });
    });

    describe('matchesPattern', () => {
        it('matches exact pattern', () => {
            expect(service.matchesPattern('git log', 'git log')).to.be.true;
        });

        it('does not match pattern with additional args without wildcard', () => {
            expect(service.matchesPattern('git log --oneline', 'git log')).to.be.false;
        });

        it('matches trailing wildcard with args', () => {
            expect(service.matchesPattern('git log --oneline', 'git log *')).to.be.true;
        });

        it('matches trailing wildcard without args', () => {
            expect(service.matchesPattern('git log', 'git log *')).to.be.true;
        });

        it('does not match partial word', () => {
            expect(service.matchesPattern('git logger', 'git log')).to.be.false;
            expect(service.matchesPattern('git logger', 'git log *')).to.be.false;
        });

        it('does not match when pattern is not at start', () => {
            expect(service.matchesPattern('sudo git log', 'git log')).to.be.false;
        });
    });

    describe('getPatterns', () => {
        it('returns current patterns from preferences', () => {
            storedPatterns = ['git log', 'npm test'];
            const patterns = service.getPatterns();
            expect(patterns).to.deep.equal(['git log', 'npm test']);
        });

        it('returns empty array when no patterns configured', () => {
            storedPatterns = [];
            const patterns = service.getPatterns();
            expect(patterns).to.deep.equal([]);
        });
    });

    describe('removePattern', () => {
        it('removes existing pattern', () => {
            storedPatterns = ['git log', 'npm test'];
            service.removePattern('git log');
            expect(preferenceServiceMock.updateValue.calledOnce).to.be.true;
            expect(storedPatterns).to.deep.equal(['npm test']);
        });

        it('does not call updateValue when pattern does not exist', () => {
            storedPatterns = ['git log'];
            service.removePattern('npm test');
            expect(preferenceServiceMock.updateValue.called).to.be.false;
        });
    });

    describe('blacklist functionality', () => {
        describe('isCommandBlacklisted', () => {
            it('returns false when blacklist is empty', () => {
                storedBlacklistPatterns = [];
                expect(service.isCommandBlacklisted('git push')).to.be.false;
            });

            it('returns true for exact match', () => {
                storedBlacklistPatterns = ['git push'];
                expect(service.isCommandBlacklisted('git push')).to.be.true;
                expect(service.isCommandBlacklisted('git push origin')).to.be.false;
            });

            it('returns true for wildcard match', () => {
                storedBlacklistPatterns = ['git push *'];
                expect(service.isCommandBlacklisted('git push')).to.be.true;
                expect(service.isCommandBlacklisted('git push origin main')).to.be.true;
                expect(service.isCommandBlacklisted('git pull')).to.be.false;
            });

            it('checks all sub-commands for blacklist - returns true if ANY matches', () => {
                storedBlacklistPatterns = ['rm -rf *'];
                expect(service.isCommandBlacklisted('ls && rm -rf /')).to.be.true;
            });
        });

        describe('blacklist precedence over whitelist', () => {
            it('denies command that matches both blacklist and whitelist', () => {
                storedPatterns = ['git *'];
                storedBlacklistPatterns = ['git push *'];
                expect(service.isCommandAllowed('git log')).to.be.true;
                expect(service.isCommandAllowed('git push origin')).to.be.false;
            });
        });

        describe('getBlacklistPatterns', () => {
            it('returns empty array when no patterns', () => {
                storedBlacklistPatterns = [];
                expect(service.getBlacklistPatterns()).to.deep.equal([]);
            });

            it('returns stored patterns', () => {
                storedBlacklistPatterns = ['git push *', 'rm -rf *'];
                expect(service.getBlacklistPatterns()).to.deep.equal(['git push *', 'rm -rf *']);
            });
        });

        describe('addBlacklistPattern', () => {
            it('adds valid pattern', () => {
                service.addBlacklistPattern('git push *');
                expect(storedBlacklistPatterns).to.deep.equal(['git push *']);
            });

            it('rejects empty pattern', () => {
                expect(() => service.addBlacklistPattern('')).to.throw('Pattern cannot be empty or whitespace-only');
            });

            it('rejects * alone', () => {
                expect(() => service.addBlacklistPattern('*')).to.throw(/too permissive/);
            });

            it('rejects invalid wildcard position (git push*)', () => {
                expect(() => service.addBlacklistPattern('git push*')).to.throw(/must be preceded by a space/);
            });
        });

        describe('removeBlacklistPattern', () => {
            it('removes existing pattern', () => {
                storedBlacklistPatterns = ['git push *', 'rm -rf *'];
                service.removeBlacklistPattern('git push *');
                expect(storedBlacklistPatterns).to.deep.equal(['rm -rf *']);
            });
        });
    });

    describe('checkCommand', () => {
        it('returns dangerous reason for dangerous commands', () => {
            const result = service.checkCommand('echo $(whoami)');
            expect(result.allowed).to.be.false;
            expect(result.reason).to.equal('dangerous');
        });

        it('returns blacklisted reason with matched pattern', () => {
            storedBlacklistPatterns = ['git push *'];
            const result = service.checkCommand('git push origin');
            expect(result.allowed).to.be.false;
            expect(result.reason).to.equal('blacklisted');
            expect(result.matchedPattern).to.equal('git push *');
        });

        it('returns allowed for whitelisted commands', () => {
            storedPatterns = ['git log *'];
            const result = service.checkCommand('git log --oneline');
            expect(result.allowed).to.be.true;
            expect(result.reason).to.be.undefined;
        });

        it('returns not-whitelisted for unmatched commands', () => {
            storedPatterns = [];
            const result = service.checkCommand('some-command');
            expect(result.allowed).to.be.false;
            expect(result.reason).to.equal('not-whitelisted');
        });

        it('returns blacklisted before whitelisted (precedence)', () => {
            storedPatterns = ['git *'];
            storedBlacklistPatterns = ['git push *'];
            const result = service.checkCommand('git push origin');
            expect(result.allowed).to.be.false;
            expect(result.reason).to.equal('blacklisted');
            expect(result.matchedPattern).to.equal('git push *');
        });
    });
});
