// *****************************************************************************
// Copyright (C) 2025 STMicroelectronics and others.
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
// code copied and modified from https://github.com/microsoft/vscode/blob/1.103.2/src/vscode-dts/vscode.proposed.textEditorDiffInformation.d.ts

export module '@theia/plugin' {
    // https://github.com/microsoft/vscode/issues/84899

    export enum TextEditorChangeKind {
        Addition = 1,
        Deletion = 2,
        Modification = 3
    }

    export interface TextEditorLineRange {
        readonly startLineNumber: number;
        readonly endLineNumberExclusive: number;
    }

    export interface TextEditorChange {
        readonly original: TextEditorLineRange;
        readonly modified: TextEditorLineRange;
        readonly kind: TextEditorChangeKind;
    }

    export interface TextEditorDiffInformation {
        readonly documentVersion: number;
        readonly original: Uri | undefined;
        readonly modified: Uri;
        readonly changes: readonly TextEditorChange[];
        readonly isStale: boolean;
    }

    export interface TextEditorDiffInformationChangeEvent {
        readonly textEditor: TextEditor;
        readonly diffInformation: TextEditorDiffInformation[] | undefined;
    }

    export interface TextEditor {
        readonly diffInformation: TextEditorDiffInformation[] | undefined;
    }

    export namespace window {
        export const onDidChangeTextEditorDiffInformation: Event<TextEditorDiffInformationChangeEvent>;
    }

}
