// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { MaybePromise, serviceIdentifier } from '@theia/core';

export interface GitPrompt {

    ask(question: GitPrompt.Question): MaybePromise<GitPrompt.Answer>;

    // TODO: implement `confirm` with boolean return type.
    // TODO: implement `select` with possible answers.
}
export namespace GitPrompt {

    export const Identifier = serviceIdentifier<GitPrompt>('GitPrompt');

    /**
     * Unique WS endpoint path for the Git prompt service.
     */
    export const WS_PATH = 'services/git-prompt';

    export interface Question {
        readonly text: string;
        readonly details?: string;
        readonly password?: boolean;
    }

    export interface Answer {
        readonly type: Answer.Type;
    }

    export interface Success {
        readonly type: Answer.Type.SUCCESS;
        readonly result: string | boolean;
    }

    export namespace Success {

        export function is(answer: Answer): answer is Success {
            return answer.type === Answer.Type.SUCCESS
                && 'result' in answer
                && ((typeof (answer as Success).result) === 'string' || (typeof (answer as Success).result) === 'boolean');
        }

        export function create(result: string | boolean): Success {
            return {
                type: Answer.Type.SUCCESS,
                result
            };
        }
    }

    export interface Cancel extends Answer {
        readonly type: Answer.Type.CANCEL;
    }

    export namespace Cancel {

        export function is(answer: Answer): answer is Cancel {
            return answer.type === Answer.Type.CANCEL;
        }

        export function create(): Cancel {
            return {
                type: Answer.Type.CANCEL
            };
        }
    }

    export interface Failure extends Answer {
        readonly type: Answer.Type.FAILURE;
        readonly error: string | Error;
    }

    export namespace Failure {

        export function is(answer: Answer): answer is Failure {
            return answer.type === Answer.Type.FAILURE
                && 'error' in answer
                && ((typeof (answer as Failure).error) === 'string' || (answer as Failure).error instanceof Error);
        }

        export function create(error: string | Error): Failure {
            return {
                type: Answer.Type.FAILURE,
                error
            };
        }
    }

    export namespace Answer {

        export enum Type {
            SUCCESS,
            CANCEL,
            FAILURE
        }
    }
}
