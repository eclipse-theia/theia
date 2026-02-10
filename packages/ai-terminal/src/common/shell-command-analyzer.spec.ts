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
import { DefaultShellCommandAnalyzer } from './shell-command-analyzer';

describe('shell-command-analyzer', () => {
    let analyzer: DefaultShellCommandAnalyzer;

    beforeEach(() => {
        analyzer = new DefaultShellCommandAnalyzer();
    });

    describe('parseCommand', () => {
        it('should parse a single command', () => {
            expect(analyzer.parseCommand('git log')).to.deep.equal(['git log']);
        });

        it('should split on AND operator (&&)', () => {
            expect(analyzer.parseCommand('git status && git log')).to.deep.equal(['git status', 'git log']);
        });

        it('should split on OR operator (||)', () => {
            expect(analyzer.parseCommand('cmd1 || cmd2')).to.deep.equal(['cmd1', 'cmd2']);
        });

        it('should split on semicolon (;)', () => {
            expect(analyzer.parseCommand('cmd1 ; cmd2')).to.deep.equal(['cmd1', 'cmd2']);
        });

        it('should split on pipe (|)', () => {
            expect(analyzer.parseCommand('cat file | grep pattern')).to.deep.equal(['cat file', 'grep pattern']);
        });

        it('should handle mixed operators', () => {
            expect(analyzer.parseCommand('cmd1 && cmd2 | cmd3 ; cmd4')).to.deep.equal(['cmd1', 'cmd2', 'cmd3', 'cmd4']);
        });

        it('should trim whitespace from sub-commands', () => {
            expect(analyzer.parseCommand('  git log  &&  git status  ')).to.deep.equal(['git log', 'git status']);
        });

        it('should return empty array for empty command', () => {
            expect(analyzer.parseCommand('')).to.deep.equal([]);
        });

        it('should return empty array for only operators', () => {
            expect(analyzer.parseCommand('&& || ;')).to.deep.equal([]);
        });
    });

    describe('containsDangerousPatterns', () => {
        it('should return false for safe commands', () => {
            expect(analyzer.containsDangerousPatterns('git log')).to.be.false;
        });

        it('should return true for command substitution with $(', () => {
            expect(analyzer.containsDangerousPatterns('echo $(whoami)')).to.be.true;
        });

        it('should return true for backticks', () => {
            expect(analyzer.containsDangerousPatterns('echo `whoami`')).to.be.true;
        });

        it('should return true when dangerous pattern is nested in argument', () => {
            expect(analyzer.containsDangerousPatterns('git log $(malicious)')).to.be.true;
        });

        it('should return false for safe dollar sign (variable)', () => {
            expect(analyzer.containsDangerousPatterns('echo $HOME')).to.be.false;
        });

        it('should return true for process substitution with <(', () => {
            expect(analyzer.containsDangerousPatterns('cat <(ls)')).to.be.true;
            expect(analyzer.containsDangerousPatterns('diff <(ls dir1) <(ls dir2)')).to.be.true;
        });

        it('should return true for process substitution with >(', () => {
            expect(analyzer.containsDangerousPatterns('tee >(grep foo)')).to.be.true;
        });

        it('should return true for parameter expansion with ${', () => {
            expect(analyzer.containsDangerousPatterns('echo ${PATH}')).to.be.true;
            expect(analyzer.containsDangerousPatterns('echo ${var:-default}')).to.be.true;
        });

        it('should return true for subshell at command start', () => {
            expect(analyzer.containsDangerousPatterns('(cd /tmp && ls)')).to.be.true;
            expect(analyzer.containsDangerousPatterns('  (cd /tmp && ls)')).to.be.true; // with leading whitespace
        });

        it('should return false for safe parentheses in arguments', () => {
            expect(analyzer.containsDangerousPatterns("grep '(pattern)' file")).to.be.false;
            expect(analyzer.containsDangerousPatterns('echo "(hello)"')).to.be.false;
        });
    });
});
