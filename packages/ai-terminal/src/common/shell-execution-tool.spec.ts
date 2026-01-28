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
import {
    combineAndTruncate,
    truncateLine,
    HEAD_LINES,
    TAIL_LINES,
    GRACE_LINES,
    MAX_LINE_LENGTH
} from './shell-execution-server';

describe('Shell Execution Tool', () => {
    describe('combineAndTruncate', () => {
        it('should return stdout when no stderr', () => {
            const result = combineAndTruncate('stdout content', '');
            expect(result).to.equal('stdout content');
        });

        it('should return stderr when no stdout', () => {
            const result = combineAndTruncate('', 'stderr content');
            expect(result).to.equal('stderr content');
        });

        it('should combine stdout and stderr with separator', () => {
            const result = combineAndTruncate('stdout content', 'stderr content');
            expect(result).to.equal('stdout content\n--- stderr ---\nstderr content');
        });

        it('should return empty string when both are empty', () => {
            const result = combineAndTruncate('', '');
            expect(result).to.equal('');
        });

        it('should not truncate output within grace area', () => {
            const lineCount = HEAD_LINES + TAIL_LINES + GRACE_LINES;
            const lines = Array.from({ length: lineCount }, (_, i) => `line ${i + 1}`);
            const stdout = lines.join('\n');
            const result = combineAndTruncate(stdout, '');
            expect(result).to.not.include('lines omitted');
            expect(result.split('\n').length).to.equal(lineCount);
        });

        it('should truncate output exceeding grace area', () => {
            const lineCount = HEAD_LINES + TAIL_LINES + GRACE_LINES + 1;
            const lines = Array.from({ length: lineCount }, (_, i) => `line ${i + 1}`);
            const stdout = lines.join('\n');
            const result = combineAndTruncate(stdout, '');
            expect(result).to.include('lines omitted');
        });

        it('should truncate long lines in output', () => {
            const longLine = 'x'.repeat(MAX_LINE_LENGTH + 500);
            const result = combineAndTruncate(longLine, '');
            expect(result).to.include('chars omitted');
            expect(result.length).to.be.lessThan(longLine.length);
        });
    });

    describe('truncateLine', () => {
        it('should not truncate short lines', () => {
            const line = 'short line';
            expect(truncateLine(line)).to.equal(line);
        });

        it('should not truncate lines at exactly MAX_LINE_LENGTH', () => {
            const line = 'x'.repeat(MAX_LINE_LENGTH);
            expect(truncateLine(line)).to.equal(line);
        });

        it('should truncate lines exceeding MAX_LINE_LENGTH', () => {
            const line = 'x'.repeat(MAX_LINE_LENGTH + 100);
            const result = truncateLine(line);
            expect(result).to.include('chars omitted');
            expect(result.length).to.be.lessThan(line.length);
        });

        it('should preserve start and end of truncated lines', () => {
            const start = 'START_';
            const end = '_END';
            const middle = 'x'.repeat(MAX_LINE_LENGTH + 100);
            const line = start + middle + end;
            const result = truncateLine(line);
            expect(result.startsWith(start)).to.be.true;
            expect(result.endsWith(end)).to.be.true;
        });
    });
});
