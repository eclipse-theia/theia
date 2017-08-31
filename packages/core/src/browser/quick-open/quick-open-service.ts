/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { QuickOpenModel } from './quick-open-model';

export type QuickOpenOptions = Partial<QuickOpenOptions.Resolved>;
export namespace QuickOpenOptions {
    export interface Resolved {
        readonly prefix: string;
        readonly inputTooltip: string;
        onClose(canceled: boolean): void;

        readonly fuzzyMatchLabel: boolean;
        readonly fuzzyMatchDetail: boolean;
        readonly fuzzyMatchDescription: boolean;
        readonly fuzzySort: boolean;
    }
    export const defaultOptions: Resolved = Object.freeze({
        prefix: '',
        inputTooltip: '',
        onClose: () => { /* no-op*/ },
        fuzzyMatchLabel: false,
        fuzzyMatchDetail: false,
        fuzzyMatchDescription: false,
        fuzzySort: false
    });
    export const fuzzyOptions: Resolved = Object.freeze({
        prefix: '',
        inputTooltip: '',
        onClose: () => { /* no-op*/ },
        fuzzyMatchLabel: true,
        fuzzyMatchDetail: true,
        fuzzyMatchDescription: true,
        fuzzySort: true
    });
    export function resolve(options: QuickOpenOptions = {}, source: Resolved = defaultOptions): Resolved {
        return Object.assign({}, source, options);
    }
    export function resolveFuzzy(options?: QuickOpenOptions): Resolved {
        return resolve(options, fuzzyOptions);
    }
}

@injectable()
export class QuickOpenService {
    open(model: QuickOpenModel, options?: QuickOpenOptions): void {
        // no-op
    }
}

