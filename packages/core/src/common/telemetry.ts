// *****************************************************************************
// Copyright (C) 2023 STMicroelectronics and others.
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

export class TelemetryTrustedValue<T> {
    readonly value: T;

    constructor(value: T) {
        this.value = value;
    }
}

export interface TelemetryLogger {
    readonly sender: TelemetrySender;
    readonly options: TelemetryLoggerOptions | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logUsage(eventName: string, data?: Record<string, any | TelemetryTrustedValue<any>>): void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logError(eventNameOrException: string | Error, data?: Record<string, any | TelemetryTrustedValue<any>>): void;

    dispose(): void;
}

interface TelemetrySender {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sendEventData(eventName: string, data?: Record<string, any>): void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sendErrorData(error: Error, data?: Record<string, any>): void;
    flush?(): void | Thenable<void>;
}

interface TelemetryLoggerOptions {
}
