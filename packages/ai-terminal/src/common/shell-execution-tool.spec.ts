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
    combineOutput,
    truncateOutput,
    truncateLine,
    truncateLineWithInfo,
    HEAD_LINES,
    TAIL_LINES,
    GRACE_LINES,
    MAX_LINE_LENGTH
} from './shell-execution-server';

describe('Shell Execution Tool', () => {
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

    describe('truncateLineWithInfo', () => {
        it('should report 0 charsOmitted for short lines', () => {
            const result = truncateLineWithInfo('short line');
            expect(result.result).to.equal('short line');
            expect(result.charsOmitted).to.equal(0);
        });

        it('should report 0 charsOmitted for lines at exactly MAX_LINE_LENGTH', () => {
            const line = 'x'.repeat(MAX_LINE_LENGTH);
            const result = truncateLineWithInfo(line);
            expect(result.result).to.equal(line);
            expect(result.charsOmitted).to.equal(0);
        });

        it('should report correct charsOmitted for long lines', () => {
            const line = 'x'.repeat(MAX_LINE_LENGTH + 200);
            const result = truncateLineWithInfo(line);
            expect(result.charsOmitted).to.be.greaterThan(0);
            expect(result.result).to.include('chars omitted');
            // The omitted count in the message should match the reported count
            const match = /\[(\d+) chars omitted\]/.exec(result.result);
            expect(match).to.not.be.undefined;
            expect(parseInt(match![1])).to.equal(result.charsOmitted);
        });
    });

    describe('combineOutput', () => {
        it('should combine stdout and stderr without truncation', () => {
            const result = combineOutput('stdout content', 'stderr content');
            expect(result).to.equal('stdout content\n--- stderr ---\nstderr content');
        });

        it('should return stdout when no stderr', () => {
            const result = combineOutput('stdout only', '');
            expect(result).to.equal('stdout only');
        });

        it('should return stderr when no stdout', () => {
            const result = combineOutput('', 'stderr only');
            expect(result).to.equal('stderr only');
        });

        it('should return empty string when both are empty', () => {
            const result = combineOutput('', '');
            expect(result).to.equal('');
        });

        it('should preserve all lines without truncation', () => {
            const lineCount = HEAD_LINES + TAIL_LINES + GRACE_LINES + 100;
            const lines = Array.from({ length: lineCount }, (_, i) => `line ${i + 1}`);
            const stdout = lines.join('\n');
            const result = combineOutput(stdout, '');
            expect(result.split('\n').length).to.equal(lineCount);
            expect(result).to.not.include('lines omitted');
        });

        it('should preserve long lines without truncation', () => {
            const longLine = 'x'.repeat(MAX_LINE_LENGTH + 500);
            const result = combineOutput(longLine, '');
            expect(result).to.equal(longLine);
            expect(result).to.not.include('chars omitted');
        });
    });

    describe('truncateOutput', () => {
        it('should return totalCharsOmitted: 0 when no truncation needed', () => {
            const result = truncateOutput('short output');
            expect(result.output).to.equal('short output');
            expect(result.totalCharsOmitted).to.equal(0);
        });

        it('should return totalCharsOmitted: 0 for empty string', () => {
            const result = truncateOutput('');
            expect(result.output).to.equal('');
            expect(result.totalCharsOmitted).to.equal(0);
        });

        it('should report correct omitted chars for line-count truncation', () => {
            const lineCount = HEAD_LINES + TAIL_LINES + GRACE_LINES + 20;
            const lines = Array.from({ length: lineCount }, (_, i) => `line ${i + 1}`);
            const input = lines.join('\n');
            const result = truncateOutput(input);
            expect(result.output).to.include('lines omitted');
            expect(result.totalCharsOmitted).to.be.greaterThan(0);
        });

        it('should report correct omitted chars for line-length truncation only', () => {
            const longLine = 'x'.repeat(MAX_LINE_LENGTH + 200);
            const result = truncateOutput(longLine);
            expect(result.output).to.include('chars omitted');
            expect(result.totalCharsOmitted).to.be.greaterThan(0);
        });

        it('should not truncate output within grace area', () => {
            const lineCount = HEAD_LINES + TAIL_LINES + GRACE_LINES;
            const lines = Array.from({ length: lineCount }, (_, i) => `line ${i + 1}`);
            const input = lines.join('\n');
            const result = truncateOutput(input);
            expect(result.output).to.not.include('lines omitted');
            expect(result.totalCharsOmitted).to.equal(0);
        });
    });
});
