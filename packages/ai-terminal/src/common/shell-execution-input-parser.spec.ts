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
import { parseShellExecutionInput } from './shell-execution-input-parser';

describe('parseShellExecutionInput', () => {
    describe('complete JSON', () => {
        it('should parse complete JSON with command only', () => {
            const result = parseShellExecutionInput('{"command": "ls -la"}');
            expect(result.command).to.equal('ls -la');
        });

        it('should parse complete JSON with all fields', () => {
            const result = parseShellExecutionInput('{"command": "npm install", "cwd": "/home/user", "timeout": 30000}');
            expect(result.command).to.equal('npm install');
            expect(result.cwd).to.equal('/home/user');
            expect(result.timeout).to.equal(30000);
        });

        it('should parse JSON without spaces', () => {
            const result = parseShellExecutionInput('{"command":"git status"}');
            expect(result.command).to.equal('git status');
        });
    });

    describe('incomplete JSON (streaming)', () => {
        it('should extract command from incomplete JSON without closing brace', () => {
            const result = parseShellExecutionInput('{"command": "ls -la"');
            expect(result.command).to.equal('ls -la');
        });

        it('should extract partial command value without closing quote', () => {
            const result = parseShellExecutionInput('{"command": "ls -la');
            expect(result.command).to.equal('ls -la');
        });

        it('should extract command when value is being typed', () => {
            const result = parseShellExecutionInput('{"command": "git st');
            expect(result.command).to.equal('git st');
        });

        it('should return empty command when only key is present', () => {
            const result = parseShellExecutionInput('{"command": "');
            expect(result.command).to.equal('');
        });

        it('should handle JSON without spaces around colon', () => {
            const result = parseShellExecutionInput('{"command":"npm run');
            expect(result.command).to.equal('npm run');
        });

        it('should handle incomplete JSON with additional fields after command', () => {
            const result = parseShellExecutionInput('{"command": "echo hello", "cwd": "/tmp');
            expect(result.command).to.equal('echo hello');
        });
    });

    describe('edge cases', () => {
        it('should return empty command for undefined input', () => {
            const result = parseShellExecutionInput(undefined);
            expect(result.command).to.equal('');
        });

        it('should return empty command for empty string', () => {
            const result = parseShellExecutionInput('');
            expect(result.command).to.equal('');
        });

        it('should return empty command for incomplete JSON without command key', () => {
            const result = parseShellExecutionInput('{"cwd": "/home"');
            expect(result.command).to.equal('');
        });

        it('should return empty command for malformed JSON', () => {
            const result = parseShellExecutionInput('{command: ls}');
            expect(result.command).to.equal('');
        });

        it('should return empty command when just opening brace', () => {
            const result = parseShellExecutionInput('{');
            expect(result.command).to.equal('');
        });

        it('should return empty command for partial key', () => {
            const result = parseShellExecutionInput('{"com');
            expect(result.command).to.equal('');
        });

        it('should handle command with escaped quotes in complete JSON', () => {
            const result = parseShellExecutionInput('{"command": "echo \\"hello\\""}');
            expect(result.command).to.equal('echo "hello"');
        });

        it('should handle incomplete command with backslash', () => {
            // During streaming, we get partial content - the regex stops at first unescaped quote
            const result = parseShellExecutionInput('{"command": "echo \\"hello');
            expect(result.command).to.equal('echo \\');
        });

        it('should handle command with pipes and redirects', () => {
            const result = parseShellExecutionInput('{"command": "cat file.txt | grep error > output.log"}');
            expect(result.command).to.equal('cat file.txt | grep error > output.log');
        });
    });

    describe('fullOutput', () => {
        it('should parse fullOutput: true', () => {
            const result = parseShellExecutionInput('{"command": "git diff", "fullOutput": true}');
            expect(result.command).to.equal('git diff');
            expect(result.fullOutput).to.be.true;
        });

        it('should parse fullOutput: false', () => {
            const result = parseShellExecutionInput('{"command": "ls -la", "fullOutput": false}');
            expect(result.command).to.equal('ls -la');
            expect(result.fullOutput).to.be.false;
        });

        it('should have undefined fullOutput when not specified', () => {
            const result = parseShellExecutionInput('{"command": "echo hello"}');
            expect(result.command).to.equal('echo hello');
            expect(result.fullOutput).to.be.undefined;
        });

        it('should parse fullOutput alongside other optional fields', () => {
            const result = parseShellExecutionInput('{"command": "npm test", "cwd": "/tmp", "timeout": 60000, "fullOutput": true}');
            expect(result.command).to.equal('npm test');
            expect(result.cwd).to.equal('/tmp');
            expect(result.timeout).to.equal(60000);
            expect(result.fullOutput).to.be.true;
        });
    });
});
