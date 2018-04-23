/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from 'inversify';
import { MaybePromise } from '@theia/core/lib/common/types';

@injectable()
export class GitCommitMessageValidator {

    static readonly MAX_CHARS_PER_LINE = 72;

    /**
     * Validates the input and returns with either a validation result with the status and message, or `undefined` if everything went fine.
     */
    validate(input: string | undefined): MaybePromise<GitCommitMessageValidator.Result | undefined> {
        if (input) {
            const lines = input.split(/\r?\n/);
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const result = this.isLineValid(line, i);
                if (!!result) {
                    return result;
                }
            }
        }
        return undefined;
    }

    protected isLineValid(line: string, index: number): GitCommitMessageValidator.Result | undefined {
        if (index === 1 && line.length !== 0) {
            return {
                status: 'warning',
                message: 'The second line should be empty to separate the commit message from the body'
            };
        }
        const diff = line.length - this.maxCharsPerLine();
        if (diff > 0) {
            return {
                status: 'warning',
                message: `${diff} characters over ${this.maxCharsPerLine()} in current line`
            };
        }
        return undefined;
    }

    protected maxCharsPerLine(): number {
        return GitCommitMessageValidator.MAX_CHARS_PER_LINE;
    }

}

export namespace GitCommitMessageValidator {

    /**
     * Type for the validation result with a status and a corresponding message.
     */
    export type Result = Readonly<{ message: string, status: 'info' | 'success' | 'warning' | 'error' }>;

    export namespace Result {

        /**
         * `true` if the `message` and the `status` properties are the same on both `left` and `right`. Or both arguments are `undefined`. Otherwise, `false`.
         */
        export function equal(left: Result | undefined, right: Result | undefined): boolean {
            if (left && right) {
                return left.message === right.message && left.status === right.status;
            }
            return left === right;
        }

    }

}
