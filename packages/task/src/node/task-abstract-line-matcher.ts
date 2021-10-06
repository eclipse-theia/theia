/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isWindows } from '@theia/core/lib/common/os';
import { Diagnostic, DiagnosticSeverity, Range } from '@theia/core/shared/vscode-languageserver-protocol';
import {
    FileLocationKind, ProblemMatcher, ProblemPattern,
    ProblemMatch, ProblemMatchData, ProblemLocationKind
} from '../common/problem-matcher-protocol';
import URI from '@theia/core/lib/common/uri';
// TODO use only URI from '@theia/core'
import { URI as vscodeURI } from '@theia/core/shared/vscode-uri';
import { Severity } from '@theia/core/lib/common/severity';

const endOfLine: string = isWindows ? '\r\n' : '\n';

export interface ProblemData {
    kind?: ProblemLocationKind;
    file?: string;
    location?: string;
    line?: string;
    character?: string;
    endLine?: string;
    endCharacter?: string;
    message?: string;
    severity?: string;
    code?: string;
}

export abstract class AbstractLineMatcher {

    protected patterns: ProblemPattern[] = [];
    protected activePatternIndex: number = 0;
    protected activePattern: ProblemPattern | undefined;
    protected cachedProblemData: ProblemData;

    constructor(
        protected matcher: ProblemMatcher
    ) {
        if (Array.isArray(matcher.pattern)) {
            this.patterns = matcher.pattern;
        } else {
            this.patterns = [matcher.pattern];
        }
        this.cachedProblemData = this.getEmptyProblemData();

        if (this.patterns.slice(0, this.patternCount - 1).some(p => !!p.loop)) {
            console.error('Problem Matcher: Only the last pattern can loop');
        }
    }

    /**
     * Finds the problem identified by this line matcher.
     *
     * @param line the line of text to find the problem from
     * @return the identified problem. If the problem is not found, `undefined` is returned.
     */
    abstract match(line: string): ProblemMatch | undefined;

    /**
     * Number of problem patterns that the line matcher uses.
     */
    get patternCount(): number {
        return this.patterns.length;
    }

    protected getEmptyProblemData(): ProblemData {
        // eslint-disable-next-line no-null/no-null
        return Object.create(null) as ProblemData;
    }

    protected fillProblemData(data: ProblemData | null, pattern: ProblemPattern, matches: RegExpExecArray): data is ProblemData {
        if (data) {
            this.fillProperty(data, 'file', pattern, matches, true);
            this.appendProperty(data, 'message', pattern, matches, true);
            this.fillProperty(data, 'code', pattern, matches, true);
            this.fillProperty(data, 'severity', pattern, matches, true);
            this.fillProperty(data, 'location', pattern, matches, true);
            this.fillProperty(data, 'line', pattern, matches);
            this.fillProperty(data, 'character', pattern, matches);
            this.fillProperty(data, 'endLine', pattern, matches);
            this.fillProperty(data, 'endCharacter', pattern, matches);
            return true;
        }
        return false;
    }

    private appendProperty(data: ProblemData, property: keyof ProblemData, pattern: ProblemPattern, matches: RegExpExecArray, trim: boolean = false): void {
        const patternProperty = pattern[property];
        if (data[property] === undefined) {
            this.fillProperty(data, property, pattern, matches, trim);
        } else if (patternProperty !== undefined && patternProperty < matches.length) {
            let value = matches[patternProperty];
            if (trim) {
                value = value.trim();
            }
            (data[property] as string) += endOfLine + value;
        }
    }

    private fillProperty(data: ProblemData, property: keyof ProblemData, pattern: ProblemPattern, matches: RegExpExecArray, trim: boolean = false): void {
        const patternAtProperty = pattern[property];
        if (data[property] === undefined && patternAtProperty !== undefined && patternAtProperty < matches.length) {
            let value = matches[patternAtProperty];
            if (value !== undefined) {
                if (trim) {
                    value = value.trim();
                }
                (data[property] as string) = value;
            }
        }
    }

    protected getMarkerMatch(data: ProblemData): ProblemMatch | undefined {
        try {
            const location = this.getLocation(data);
            if (data.file && location && data.message) {
                const marker: Diagnostic = {
                    severity: this.getSeverity(data),
                    range: location,
                    message: data.message
                };
                if (data.code !== undefined) {
                    marker.code = data.code;
                }
                if (this.matcher.source !== undefined) {
                    marker.source = this.matcher.source;
                }
                return {
                    description: this.matcher,
                    resource: this.getResource(data.file, this.matcher),
                    marker
                } as ProblemMatchData;
            }
            return {
                description: this.matcher
            };
        } catch (err) {
            console.error(`Failed to convert problem data into match: ${JSON.stringify(data)}`);
        }
        return undefined;
    }

    private getLocation(data: ProblemData): Range | null {
        if (data.kind === ProblemLocationKind.File) {
            return this.createRange(0, 0, 0, 0);
        }
        if (data.location) {
            return this.parseLocationInfo(data.location);
        }
        if (!data.line) {
            // eslint-disable-next-line no-null/no-null
            return null;
        }
        const startLine = parseInt(data.line);
        const startColumn = data.character ? parseInt(data.character) : undefined;
        const endLine = data.endLine ? parseInt(data.endLine) : undefined;
        const endColumn = data.endCharacter ? parseInt(data.endCharacter) : undefined;
        return this.createRange(startLine, startColumn, endLine, endColumn);
    }

    private parseLocationInfo(value: string): Range | null {
        if (!value || !value.match(/(\d+|\d+,\d+|\d+,\d+,\d+,\d+)/)) {
            // eslint-disable-next-line no-null/no-null
            return null;
        }
        const parts = value.split(',');
        const startLine = parseInt(parts[0]);
        const startColumn = parts.length > 1 ? parseInt(parts[1]) : undefined;
        if (parts.length > 3) {
            return this.createRange(startLine, startColumn, parseInt(parts[2]), parseInt(parts[3]));
        } else {
            return this.createRange(startLine, startColumn, undefined, undefined);
        }
    }

    private createRange(startLine: number, startColumn: number | undefined, endLine: number | undefined, endColumn: number | undefined): Range {
        let range: Range;
        if (startColumn !== undefined) {
            if (endColumn !== undefined) {
                range = Range.create(startLine, startColumn, endLine || startLine, endColumn);
            } else {
                range = Range.create(startLine, startColumn, startLine, startColumn);
            }
        } else {
            range = Range.create(startLine, 1, startLine, Number.MAX_VALUE);
        }

        // range indexes should be zero-based
        return Range.create(
            this.getZeroBasedRangeIndex(range.start.line),
            this.getZeroBasedRangeIndex(range.start.character),
            this.getZeroBasedRangeIndex(range.end.line),
            this.getZeroBasedRangeIndex(range.end.character)
        );
    }

    private getZeroBasedRangeIndex(ind: number): number {
        return ind === 0 ? ind : ind - 1;
    }

    private getSeverity(data: ProblemData): DiagnosticSeverity {
        // eslint-disable-next-line no-null/no-null
        let result: Severity | null = null;
        if (data.severity) {
            const value = data.severity;
            if (value) {
                result = Severity.fromValue(value);
                if (result === Severity.Ignore) {
                    if (value === 'E') {
                        result = Severity.Error;
                    } else if (value === 'W') {
                        result = Severity.Warning;
                    } else if (value === 'I') {
                        result = Severity.Info;
                    } else if (value.toLowerCase() === 'hint') {
                        result = Severity.Info;
                    } else if (value.toLowerCase() === 'note') {
                        result = Severity.Info;
                    }
                }
            }
        }
        // eslint-disable-next-line no-null/no-null
        if (result === null || result === Severity.Ignore) {
            result = this.matcher.severity || Severity.Error;
        }
        return Severity.toDiagnosticSeverity(result);
    }

    private getResource(filename: string, matcher: ProblemMatcher): vscodeURI {
        const kind = matcher.fileLocation;
        let fullPath: string | undefined;
        if (kind === FileLocationKind.Absolute) {
            fullPath = filename;
        } else if ((kind === FileLocationKind.Relative) && matcher.filePrefix) {
            let relativeFileName = filename.replace(/\\/g, '/');
            if (relativeFileName.startsWith('./')) {
                relativeFileName = relativeFileName.slice(2);
            }
            fullPath = new URI(matcher.filePrefix).resolve(relativeFileName).path.toString();
        }
        if (fullPath === undefined) {
            throw new Error('FileLocationKind is not actionable. Does the matcher have a filePrefix? This should never happen.');
        }
        fullPath = fullPath.replace(/\\/g, '/');
        if (fullPath[0] !== '/') {
            fullPath = '/' + fullPath;
        }
        if (matcher.uriProvider !== undefined) {
            return matcher.uriProvider(fullPath);
        } else {
            return vscodeURI.file(fullPath);
        }
    }

    protected resetActivePatternIndex(defaultIndex?: number): void {
        if (defaultIndex === undefined) {
            defaultIndex = 0;
        }
        this.activePatternIndex = defaultIndex;
        this.activePattern = this.patterns[defaultIndex];
    }

    protected nextProblemPattern(): void {
        this.activePatternIndex++;
        if (this.activePatternIndex > this.patternCount - 1) {
            this.resetActivePatternIndex();
        } else {
            this.activePattern = this.patterns[this.activePatternIndex];
        }
    }

    protected doOneLineMatch(line: string): boolean {
        if (this.activePattern) {
            const regexp = new RegExp(this.activePattern.regexp);
            const regexMatches = regexp.exec(line);
            if (regexMatches) {
                if (this.activePattern.kind !== undefined && this.cachedProblemData.kind !== undefined) {
                    this.cachedProblemData.kind = this.activePattern.kind;
                }
                return this.fillProblemData(this.cachedProblemData, this.activePattern, regexMatches);
            }
        }
        return false;
    }

    // check if active pattern is the last pattern
    protected isUsingTheLastPattern(): boolean {
        return this.patternCount > 0 && this.activePatternIndex === this.patternCount - 1;
    }

    protected isLastPatternLoop(): boolean {
        return this.patternCount > 0 && !!this.patterns[this.patternCount - 1].loop;
    }

    protected resetCachedProblemData(): void {
        this.cachedProblemData = this.getEmptyProblemData();
    }
}
