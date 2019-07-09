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

// This file is inspired by VSCode https://github.com/Microsoft/vscode/blob/1.33.1/src/vs/workbench/contrib/tasks/common/problemMatcher.ts
// 'problemMatcher.ts' copyright:
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver-types';
import vscodeURI from 'vscode-uri/lib/umd';
import { ProblemPatternContribution, WatchingMatcherContribution } from './task-protocol';

export enum ApplyToKind {
    allDocuments,
    openDocuments,
    closedDocuments
}

export namespace ApplyToKind {
    export function fromString(value: string | undefined): ApplyToKind | undefined {
        if (value) {
            value = value.toLowerCase();
            if (value === 'alldocuments') {
                return ApplyToKind.allDocuments;
            } else if (value === 'opendocuments') {
                return ApplyToKind.openDocuments;
            } else if (value === 'closeddocuments') {
                return ApplyToKind.closedDocuments;
            }
        }
        return undefined;
    }
}

export enum FileLocationKind {
    Auto,
    Relative,
    Absolute
}

export namespace FileLocationKind {
    export function fromString(value: string): FileLocationKind | undefined {
        value = value.toLowerCase();
        if (value === 'absolute') {
            return FileLocationKind.Absolute;
        } else if (value === 'relative') {
            return FileLocationKind.Relative;
        } else {
            return undefined;
        }
    }
}

export enum Severity {
    Ignore = 0,
    Info = 1,
    Warning = 2,
    Error = 3
}

export namespace Severity {

    const _error = 'error';
    const _warning = 'warning';
    const _warn = 'warn';
    const _info = 'info';

    // Parses 'error', 'warning', 'warn', 'info' in call casings and falls back to ignore.
    export function fromValue(value: string | undefined): Severity {
        if (!value) {
            return Severity.Ignore;
        }

        if (value.toLowerCase() === _error) {
            return Severity.Error;
        }

        if (value.toLowerCase() === _warning || value.toLowerCase() === _warn) {
            return Severity.Warning;
        }

        if (value.toLowerCase() === _info) {
            return Severity.Info;
        }
        return Severity.Ignore;
    }

    export function toDiagnosticSeverity(value: Severity): DiagnosticSeverity {
        switch (value) {
            case Severity.Ignore:
                return DiagnosticSeverity.Hint;
            case Severity.Info:
                return DiagnosticSeverity.Information;
            case Severity.Warning:
                return DiagnosticSeverity.Warning;
            case Severity.Error:
                return DiagnosticSeverity.Error;
            default:
                return DiagnosticSeverity.Error;
        }
    }
}

export interface WatchingPattern {
    regexp: string;
    file?: number;
}

export interface WatchingMatcher {
    // If set to true the background monitor is in active mode when the task starts.
    // This is equals of issuing a line that matches the beginPattern
    activeOnStart: boolean;
    beginsPattern: WatchingPattern;
    endsPattern: WatchingPattern;
}
export namespace WatchingMatcher {
    export function fromWatchingMatcherContribution(value: WatchingMatcherContribution | undefined): WatchingMatcher | undefined {
        if (!value) {
            return undefined;
        }
        return {
            activeOnStart: !!value.activeOnStart,
            beginsPattern: typeof value.beginsPattern === 'string' ? { regexp: value.beginsPattern } : value.beginsPattern,
            endsPattern: typeof value.endsPattern === 'string' ? { regexp: value.endsPattern } : value.endsPattern
        };
    }
}

export enum ProblemLocationKind {
    File,
    Location
}

export namespace ProblemLocationKind {
    export function fromString(value: string): ProblemLocationKind | undefined {
        value = value.toLowerCase();
        if (value === 'file') {
            return ProblemLocationKind.File;
        } else if (value === 'location') {
            return ProblemLocationKind.Location;
        } else {
            return undefined;
        }
    }
}

export interface ProblemMatcher {
    deprecated?: boolean;

    owner: string;
    source?: string;
    applyTo: ApplyToKind;
    fileLocation: FileLocationKind;
    filePrefix?: string;
    pattern: ProblemPattern | ProblemPattern[];
    severity?: Severity;
    watching?: WatchingMatcher;
    uriProvider?: (path: string) => vscodeURI;
}

export interface NamedProblemMatcher extends ProblemMatcher {
    name: string;
    label: string;
}

export namespace ProblemMatcher {
    export function isWatchModeWatcher(matcher: ProblemMatcher): boolean {
        return !!matcher.watching;
    }
}

export interface ProblemPattern {
    name?: string;

    regexp: string;

    kind?: ProblemLocationKind;
    file?: number;
    message?: number;
    location?: number;
    line?: number;
    character?: number;
    endLine?: number;
    endCharacter?: number;
    code?: number;
    severity?: number;
    loop?: boolean;
}

export interface NamedProblemPattern extends ProblemPattern {
    name: string;
}

export namespace ProblemPattern {
    export function fromProblemPatternContribution(value: ProblemPatternContribution): ProblemPattern {
        return {
            name: value.name,
            regexp: value.regexp,
            kind: value.kind ? ProblemLocationKind.fromString(value.kind) : undefined,
            file: value.file,
            message: value.message,
            location: value.location,
            line: value.line,
            character: value.character,
            endLine: value.endLine,
            endCharacter: value.endCharacter,
            code: value.code,
            severity: value.severity,
            loop: value.loop
        };
    }
}

export interface ProblemMatch {
    resource?: vscodeURI;
    description: ProblemMatcher;
}

export interface ProblemMatchData extends ProblemMatch {
    marker: Diagnostic;
}
export namespace ProblemMatchData {
    export function is(data: ProblemMatch): data is ProblemMatchData {
        return 'marker' in data;
    }
}
