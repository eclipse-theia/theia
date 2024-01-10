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

import { Event, Emitter } from '@theia/core/lib/common/event';
import { cloneAndChange } from '@theia/core';
import { mixin } from '../common/types';
import { TelemetryTrustedValue, TelemetryLoggerOptions } from './types-impl';

export class TelemetryExtImpl {

    _isTelemetryEnabled: boolean = false; // telemetry not activated by default
    private readonly onDidChangeTelemetryEnabledEmitter = new Emitter<boolean>();
    readonly onDidChangeTelemetryEnabled: Event<boolean> = this.onDidChangeTelemetryEnabledEmitter.event;

    get isTelemetryEnabled(): boolean {
        return this._isTelemetryEnabled;
    }

    set isTelemetryEnabled(isTelemetryEnabled: boolean) {
        if (this._isTelemetryEnabled !== isTelemetryEnabled) {
            this._isTelemetryEnabled = isTelemetryEnabled;
            this.onDidChangeTelemetryEnabledEmitter.fire(this._isTelemetryEnabled);
        }
    }

    createTelemetryLogger(sender: TelemetrySender, options?: TelemetryLoggerOptions | undefined): TelemetryLogger {
        const logger = new TelemetryLogger(sender, this._isTelemetryEnabled, options);
        this.onDidChangeTelemetryEnabled(isEnabled => {
            logger.telemetryEnabled = isEnabled;
        });
        return logger;
    }
}

export class TelemetryLogger {
    private sender: TelemetrySender | undefined;
    readonly options: TelemetryLoggerOptions | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly commonProperties: Record<string, any>;
    telemetryEnabled: boolean;

    private readonly onDidChangeEnableStatesEmitter: Emitter<TelemetryLogger> = new Emitter();
    readonly onDidChangeEnableStates: Event<TelemetryLogger> = this.onDidChangeEnableStatesEmitter.event;
    private _isUsageEnabled: boolean;
    private _isErrorsEnabled: boolean;

    constructor(sender: TelemetrySender, telemetryEnabled: boolean, options?: TelemetryLoggerOptions) {
        this.sender = sender;
        this.options = options;
        this.commonProperties = this.getCommonProperties();
        this._isErrorsEnabled = true;
        this._isUsageEnabled = true;
        this.telemetryEnabled = telemetryEnabled;
    }

    get isUsageEnabled(): boolean {
        return this._isUsageEnabled;
    }

    set isUsageEnabled(isUsageEnabled: boolean) {
        if (this._isUsageEnabled !== isUsageEnabled) {
            this._isUsageEnabled = isUsageEnabled;
            this.onDidChangeEnableStatesEmitter.fire(this);
        }
    }

    get isErrorsEnabled(): boolean {
        return this._isErrorsEnabled;
    }

    set isErrorsEnabled(isErrorsEnabled: boolean) {
        if (this._isErrorsEnabled !== isErrorsEnabled) {
            this._isErrorsEnabled = isErrorsEnabled;
            this.onDidChangeEnableStatesEmitter.fire(this);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logUsage(eventName: string, data?: Record<string, any | TelemetryTrustedValue<any>>): void {
        if (!this.telemetryEnabled || !this.isUsageEnabled) {
            return;
        }
        this.logEvent(eventName, data);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logError(eventNameOrException: string | Error, data?: Record<string, any | TelemetryTrustedValue<any>>): void {
        if (!this.telemetryEnabled || !this.isErrorsEnabled || !this.sender) {
            // no sender available or error shall not be sent
            return;
        }
        if (typeof eventNameOrException === 'string') {
            this.logEvent(eventNameOrException, data);
        } else {
            this.sender.sendErrorData(eventNameOrException, data);
        }
    }

    dispose(): void {
        if (this.sender?.flush) {
            let tempSender: TelemetrySender | undefined = this.sender;
            this.sender = undefined;
            Promise.resolve(tempSender.flush!()).then(tempSender = undefined);
        } else {
            this.sender = undefined;
        }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private logEvent(eventName: string, data?: Record<string, any>): void {
        // No sender means likely disposed of, we should no-op
        if (!this.sender) {
            return;
        }
        data = mixInCommonPropsAndCleanData(data || {}, this.options?.additionalCommonProperties, this.options?.ignoreBuiltInCommonProperties ? undefined : this.commonProperties);
        this.sender?.sendEventData(eventName, data);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private getCommonProperties(): Record<string, any> {
        return [];
    }
}

interface TelemetrySender {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sendEventData(eventName: string, data?: Record<string, any>): void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sendErrorData(error: Error, data?: Record<string, any>): void;
    flush?(): void | Thenable<void>;
}

// copied and modified from https://github.com/microsoft/vscode/blob/1.76.0/src/vs/workbench/api/common/extHostTelemetry.ts
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mixInCommonPropsAndCleanData(data: Record<string, any>, additionalProperties?: Record<string, any>, commonProperties?: Record<string, any>): Record<string, any> {
    let updatedData = data.properties ?? data;

    // We don't clean measurements since they are just numbers
    updatedData = cleanData(updatedData, []);

    if (additionalProperties) {
        updatedData = mixin(updatedData, additionalProperties);
    }

    if (commonProperties) {
        updatedData = mixin(updatedData, commonProperties);
    }

    if (data.properties) {
        data.properties = updatedData;
    } else {
        data = updatedData;
    }

    return data;
}

// copied and modified from https://github.com/microsoft/vscode/blob/1.76.0/src/vs/platform/telemetry/common/telemetryUtils.ts#L321-L442
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Cleans a given stack of possible paths
 * @param stack The stack to sanitize
 * @param cleanupPatterns Cleanup patterns to remove from the stack
 * @returns The cleaned stack
 */
function anonymizeFilePaths(stack: string, cleanupPatterns: RegExp[]): string {

    // Fast check to see if it is a file path to avoid doing unnecessary heavy regex work
    if (!stack || (!stack.includes('/') && !stack.includes('\\'))) {
        return stack;
    }

    let updatedStack = stack;

    const cleanUpIndexes: [number, number][] = [];
    for (const regexp of cleanupPatterns) {
        while (true) {
            const result = regexp.exec(stack);
            if (!result) {
                break;
            }
            cleanUpIndexes.push([result.index, regexp.lastIndex]);
        }
    }

    const nodeModulesRegex = /^[\\\/]?(node_modules|node_modules\.asar)[\\\/]/;
    const fileRegex = /(file:\/\/)?([a-zA-Z]:(\\\\|\\|\/)|(\\\\|\\|\/))?([\w-\._]+(\\\\|\\|\/))+[\w-\._]*/g;
    let lastIndex = 0;
    updatedStack = '';

    while (true) {
        const result = fileRegex.exec(stack);
        if (!result) {
            break;
        }

        // Check to see if the any cleanupIndexes partially overlap with this match
        const overlappingRange = cleanUpIndexes.some(([start, end]) => result.index < end && start < fileRegex.lastIndex);

        // anonymize user file paths that do not need to be retained or cleaned up.
        if (!nodeModulesRegex.test(result[0]) && !overlappingRange) {
            updatedStack += stack.substring(lastIndex, result.index) + '<REDACTED: user-file-path>';
            lastIndex = fileRegex.lastIndex;
        }
    }
    if (lastIndex < stack.length) {
        updatedStack += stack.substring(lastIndex);
    }

    return updatedStack;
}

/**
 * Attempts to remove commonly leaked PII
 * @param property The property which will be removed if it contains user data
 * @returns The new value for the property
 */
function removePropertiesWithPossibleUserInfo(property: string): string {
    // If for some reason it is undefined we skip it (this shouldn't be possible);
    if (!property) {
        return property;
    }

    const value = property.toLowerCase();

    const userDataRegexes = [
        { label: 'Google API Key', regex: /AIza[0-9A-Za-z-_]{35}/ },
        { label: 'Slack Token', regex: /xox[pbar]\-[A-Za-z0-9]/ },
        { label: 'Generic Secret', regex: /(key|token|sig|secret|signature|password|passwd|pwd|android:value)[^a-zA-Z0-9]/ },
        { label: 'Email', regex: /@[a-zA-Z0-9-]+\.[a-zA-Z0-9-]+/ } // Regex which matches @*.site
    ];

    // Check for common user data in the telemetry events
    for (const secretRegex of userDataRegexes) {
        if (secretRegex.regex.test(value)) {
            return `<REDACTED: ${secretRegex.label}>`;
        }
    }

    return property;
}

/**
 * Does a best possible effort to clean a data object from any possible PII.
 * @param data The data object to clean
 * @param paths Any additional patterns that should be removed from the data set
 * @returns A new object with the PII removed
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanData(data: Record<string, any>, cleanUpPatterns: RegExp[]): Record<string, any> {
    return cloneAndChange(data, value => {

        // If it's a trusted value it means it's okay to skip cleaning so we don't clean it
        if (value instanceof TelemetryTrustedValue) {
            return value.value;
        }

        // We only know how to clean strings
        if (typeof value === 'string') {
            let updatedProperty = value.replace(/%20/g, ' ');

            // First we anonymize any possible file paths
            updatedProperty = anonymizeFilePaths(updatedProperty, cleanUpPatterns);

            // Then we do a simple regex replace with the defined patterns
            for (const regexp of cleanUpPatterns) {
                updatedProperty = updatedProperty.replace(regexp, '');
            }

            // Lastly, remove commonly leaked PII
            updatedProperty = removePropertiesWithPossibleUserInfo(updatedProperty);

            return updatedProperty;
        }
        return undefined;
    });
}
