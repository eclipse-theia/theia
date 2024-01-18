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

export interface OutputChangedMessage {
    readonly type: 'outputChanged';
    readonly newOutputs?: Output[];
    readonly deleteStart?: number;
    readonly deleteCount?: number;
}

export interface ChangePreferredMimetypeMessage {
    readonly type: 'changePreferredMimetype';
    readonly outputId: string;
    readonly mimeType: string;
}

export type ToWebviewMessage = UpdateRenderersMessage | OutputChangedMessage | ChangePreferredMimetypeMessage | CustomRendererMessage;

export interface WebviewInitialized {
    readonly type: 'initialized';
}

export interface OnDidRenderOutput {
    readonly type: 'didRenderOutput';
    contentHeight: number;
}

export interface WheelMessage {
    readonly type: 'did-scroll-wheel';
    readonly deltaY: number;
    readonly deltaX: number;
}

export type FromWebviewMessage = WebviewInitialized | OnDidRenderOutput | WheelMessage | CustomRendererMessage;

export interface Output {
    id: string
    metadata?: Record<string, unknown>;
    items: OutputItem[];
}

export interface OutputItem {
    readonly mime: string;
    readonly data: Uint8Array;
}
