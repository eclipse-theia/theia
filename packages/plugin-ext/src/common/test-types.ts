// *****************************************************************************
// Copyright (C) 2023 Mathieu Bussieres and others.

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
 *  Copyright (c) Microsoft Corporation and others. All rights reserved.
 *  Licensed under the MIT License. See https://github.com/Microsoft/vscode/blob/master/LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// Based on https://github.com/microsoft/vscode/blob/1.72.2/src/vs/workbench/contrib/testing/common/testTypes.ts

/* eslint-disable import/no-extraneous-dependencies */

import { MarkdownString } from '@theia/core/lib/common/markdown-rendering';
import { UriComponents } from './uri-components';
import { Location, Range } from './plugin-api-rpc-model';
import { isObject } from '@theia/core';
import * as languageProtocol from '@theia/core/shared/vscode-languageserver-protocol';

export enum TestRunProfileKind {
    Run = 1,
    Debug = 2,
    Coverage = 3
}

export interface TestRunProfileDTO {
    readonly id: string;
    readonly label: string;
    readonly kind: TestRunProfileKind;
    readonly isDefault: boolean;
    readonly tag: string;
    readonly canConfigure: boolean;
}
export interface TestRunDTO {
    readonly id: string;
    readonly name: string;
    readonly isRunning: boolean;
}

export interface TestOutputDTO {
    readonly output: string;
    readonly location?: Location;
    readonly itemPath?: string[];
}

export enum TestExecutionState {
    Queued = 1,
    Running = 2,
    Passed = 3,
    Failed = 4,
    Skipped = 5,
    Errored = 6
}

export interface TestStateChangeDTO {
    readonly state: TestExecutionState;
    readonly itemPath: string[];
}

export interface TestFailureDTO extends TestStateChangeDTO {
    readonly state: TestExecutionState.Failed | TestExecutionState.Errored;
    readonly messages: TestMessageDTO[];
    readonly duration?: number;
}

export namespace TestFailureDTO {
    export function is(ref: unknown): ref is TestFailureDTO {
        return isObject<TestFailureDTO>(ref)
            && (ref.state === TestExecutionState.Failed || ref.state === TestExecutionState.Errored);
    }
}
export interface TestSuccessDTO extends TestStateChangeDTO {
    readonly state: TestExecutionState.Passed;
    readonly duration?: number;
}

export interface TestMessageStackFrameDTO {
    uri?: languageProtocol.DocumentUri;
    position?: languageProtocol.Position;
    label: string;
}

export interface TestMessageDTO {
    readonly expected?: string;
    readonly actual?: string;
    readonly location?: languageProtocol.Location;
    readonly message: string | MarkdownString;
    readonly contextValue?: string;
    readonly stackTrace?: TestMessageStackFrameDTO[];
}

export interface TestItemDTO {
    readonly id: string;
    readonly label: string;
    readonly range?: Range;
    readonly sortKey?: string;
    readonly tags: string[];
    readonly uri?: UriComponents;
    readonly busy: boolean;
    readonly canResolveChildren: boolean;
    readonly description?: string;
    readonly error?: string | MarkdownString
    readonly children?: TestItemDTO[];
}

export interface TestRunRequestDTO {
    controllerId: string;
    profileId: string;
    name: string;
    includedTests: string[][]; // array of paths
    excludedTests: string[][]; // array of paths
    preserveFocus: boolean;
}

export interface TestItemReference {
    typeTag: '$type_test_item_reference',
    controllerId: string;
    testPath: string[];
}

export namespace TestItemReference {
    export function is(ref: unknown): ref is TestItemReference {
        return isObject<TestItemReference>(ref)
            && ref.typeTag === '$type_test_item_reference'
            && typeof ref.controllerId === 'string'
            && Array.isArray(ref.testPath);
    }

    export function create(controllerId: string, testPath: string[]): TestItemReference {
        return {
            typeTag: '$type_test_item_reference',
            controllerId,
            testPath
        };
    }
}

export interface TestMessageArg {
    testItemReference: TestItemReference | undefined,
    testMessage: TestMessageDTO
}

export namespace TestMessageArg {
    export function is(arg: unknown): arg is TestMessageArg {
        return isObject<TestMessageArg>(arg)
            && isObject<TestMessageDTO>(arg.testMessage)
            && (MarkdownString.is(arg.testMessage.message) || typeof arg.testMessage.message === 'string');
    }

    export function create(testItemReference: TestItemReference | undefined, testMessageDTO: TestMessageDTO): TestMessageArg {
        return {
            testItemReference: testItemReference,
            testMessage: testMessageDTO
        };
    }
}
