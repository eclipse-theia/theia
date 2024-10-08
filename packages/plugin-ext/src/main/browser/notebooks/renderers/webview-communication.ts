// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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

export interface RendererMetadata {
    readonly id: string;
    readonly entrypoint: { readonly uri: string, readonly extends?: string; };
    readonly mimeTypes: readonly string[];
    readonly requiresMessaging: boolean;
}

export interface CustomRendererMessage {
    readonly type: 'customRendererMessage';
    readonly rendererId: string;
    readonly message: unknown;
}

export interface UpdateRenderersMessage {
    readonly type: 'updateRenderers';
    readonly rendererData: readonly RendererMetadata[];
}

export interface CellOutputChange {
    readonly cellHandle: number;
    readonly newOutputs?: Output[];
    readonly start: number;
    readonly deleteCount: number;
}

export interface OutputChangedMessage {
    readonly type: 'outputChanged';
    changes: CellOutputChange[];
}

export interface ChangePreferredMimetypeMessage {
    readonly type: 'changePreferredMimetype';
    readonly cellHandle: number;
    readonly outputId: string;
    readonly mimeType: string;
}

export interface KernelMessage {
    readonly type: 'customKernelMessage';
    readonly message: unknown;
}

export interface PreloadMessage {
    readonly type: 'preload';
    readonly resources: string[];
}

export interface notebookStylesMessage {
    readonly type: 'notebookStyles';
    styles: Record<string, string>;
}

export interface CellHeigthsMessage {
    type: 'cellHeigths';
    cellHeigths: Record<number, number>;
}

export interface CellsMoved {
    type: 'cellMoved';
    cellHandle: number;
    toIndex: number;
}

export interface CellsSpliced {
    type: 'cellsSpliced';
    start: number;
    deleteCount: number;
    newCells: number[];
}

export interface CellsChangedMessage {
    type: 'cellsChanged';
    changes: Array<CellsMoved | CellsSpliced>;
}

export interface CellHeightUpdateMessage {
    type: 'cellHeightUpdate';
    cellKind: number;
    cellHandle: number;
    height: number;
}

export interface OutputVisibilityChangedMessage {
    type: 'outputVisibilityChanged';
    cellHandle: number;
    visible: boolean;
}

export type ToWebviewMessage = UpdateRenderersMessage
    | OutputChangedMessage
    | ChangePreferredMimetypeMessage
    | CustomRendererMessage
    | KernelMessage
    | PreloadMessage
    | notebookStylesMessage
    | CellHeigthsMessage
    | CellHeightUpdateMessage
    | CellsChangedMessage
    | OutputVisibilityChangedMessage;

export interface WebviewInitialized {
    readonly type: 'initialized';
}

export interface OnDidRenderOutput {
    readonly type: 'didRenderOutput';
    cellHandle: number;
    outputId: string;
    outputHeight: number;
    bodyHeight: number;
}

export interface WheelMessage {
    readonly type: 'did-scroll-wheel';
    readonly deltaY: number;
    readonly deltaX: number;
}

export interface InputFocusChange {
    readonly type: 'inputFocusChanged';
    readonly focused: boolean;
}

export interface CellOuputFocus {
    readonly type: 'cellFocusChanged';
    readonly cellHandle: number;
}

export interface CellHeightRequest {
    readonly type: 'cellHeightRequest';
    readonly cellHandle: number;
}

export interface BodyHeightChange {
    readonly type: 'bodyHeightChange';
    readonly height: number;
}

export type FromWebviewMessage = WebviewInitialized
    | OnDidRenderOutput
    | WheelMessage
    | CustomRendererMessage
    | KernelMessage
    | InputFocusChange
    | CellOuputFocus
    | CellHeightRequest
    | BodyHeightChange;

export interface Output {
    id: string
    metadata?: Record<string, unknown>;
    items: OutputItem[];
}

export interface OutputItem {
    readonly mime: string;
    readonly data: Uint8Array;
}
