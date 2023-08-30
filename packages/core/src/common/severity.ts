// *****************************************************************************
// Copyright (C) 2019 Ericsson and others.
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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DiagnosticSeverity } from 'vscode-languageserver-protocol';
import { nls } from './nls';

export enum Severity {
    Ignore = 0,
    Error = 1,
    Warning = 2,
    Info = 3,
    Log = 4
}

const error = 'Errors';
const warning = 'Warnings';
const info = 'Info';
const log = 'Log';
const ignore = 'All';

export namespace Severity {
    export function fromValue(value: string | undefined): Severity {
        value = value && value.toLowerCase();

        if (!value) {
            return Severity.Ignore;
        }
        if (['error', 'errors'].indexOf(value) !== -1) {
            return Severity.Error;
        }
        if (['warn', 'warning', 'warnings'].indexOf(value) !== -1) {
            return Severity.Warning;
        }
        if (value === 'info') {
            return Severity.Info;
        }
        if (value === 'log') {
            return Severity.Log;
        }

        return Severity.Ignore;
    }

    export function toDiagnosticSeverity(value: Severity): DiagnosticSeverity {
        switch (value) {
            case Severity.Ignore:
                return DiagnosticSeverity.Hint;
            case Severity.Info:
                return DiagnosticSeverity.Information;
            case Severity.Log:
                return DiagnosticSeverity.Information;
            case Severity.Warning:
                return DiagnosticSeverity.Warning;
            case Severity.Error:
                return DiagnosticSeverity.Error;
            default:
                return DiagnosticSeverity.Error;
        }
    }

    export function toString(severity: Severity | undefined): string {
        switch (severity) {
            case Severity.Error:
                return error;
            case Severity.Warning:
                return warning;
            case Severity.Info:
                return info;
            case Severity.Log:
                return log;
            default:
                return ignore;
        }
    }

    export function toLocaleString(severity: string | Severity): string {
        if (severity === Severity.Error || severity === error) {
            return nls.localize('theia/core/severity/errors', 'Errors');
        } else if (severity === Severity.Warning || severity === warning) {
            return nls.localize('theia/core/severity/warnings', 'Warnings');
        } else if (severity === Severity.Info || severity === info) {
            return nls.localizeByDefault('Info');
        } else if (severity === Severity.Log || severity === log) {
            return nls.localize('theia/core/severity/log', 'Log');
        } else {
            return nls.localizeByDefault('All');
        }
    }

    export function toArray(): string[] {
        return [ignore, error, warning, info, log];
    }
}
