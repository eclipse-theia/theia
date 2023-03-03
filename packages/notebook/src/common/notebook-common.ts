// *****************************************************************************
// Copyright (C) 2023 Red Hat, Inc. and others.
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

import { Command, Event, URI } from '@theia/core';
import { MarkdownString } from '@theia/core/lib/common/markdown-rendering/markdown-string';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { CancellationToken } from '@theia/core/shared/vscode-languageserver-protocol';
import { UriComponents } from '@theia/core/lib/common/uri';

export enum CellKind {
    Markup = 1,
    Code = 2
}

export interface NotebookCellMetadata {
    /**
     * custom metadata
     */
    [key: string]: unknown;
}

export interface NotebookCellInternalMetadata {
    executionId?: string;
    executionOrder?: number;
    lastRunSuccess?: boolean;
    runStartTime?: number;
    runStartTimeAdjustment?: number;
    runEndTime?: number;
    renderDuration?: { [key: string]: number };
}

export type NotebookDocumentMetadata = Record<string, unknown>;

export interface NotebookCellStatusBarItem {
    readonly alignment: CellStatusbarAlignment;
    readonly priority?: number;
    readonly text: string;
    // readonly color?: string | ThemeColor;
    // readonly backgroundColor?: string | ThemeColor;
    readonly tooltip?: string | MarkdownString;
    readonly command?: string | Command;
    // readonly accessibilityInformation?: IAccessibilityInformation;
    readonly opacity?: string;
    readonly onlyShowWhenActive?: boolean;
}

export const enum CellStatusbarAlignment {
    Left = 1,
    Right = 2
}

export type TransientCellMetadata = { readonly [K in keyof NotebookCellMetadata]?: boolean };
export type CellContentMetadata = { readonly [K in keyof NotebookCellMetadata]?: boolean };
export type TransientDocumentMetadata = { readonly [K in keyof NotebookDocumentMetadata]?: boolean };

export interface TransientOptions {
    readonly transientOutputs: boolean;
    readonly transientCellMetadata: TransientCellMetadata;
    readonly transientDocumentMetadata: TransientDocumentMetadata;
}

export interface NotebookExtensionDescription {
    readonly id: string;
    readonly location: string | undefined;
}

export interface OutputItemDto {
    readonly mime: string;
    readonly data: BinaryBuffer;
}

export interface OutputDto {
    outputs: OutputItemDto[];
    metadata?: Record<string, unknown>;
}

export interface NotebookCellCollapseState {
    inputCollapsed?: boolean;
    outputCollapsed?: boolean;
}

export interface CellDto {
    source: string;
    language: string;
    cellKind: CellKind;
    outputs: OutputDto[];
    metadata?: NotebookCellMetadata;
    internalMetadata?: NotebookCellInternalMetadata;
    collapseState?: NotebookCellCollapseState;
}

export interface NotebookData {
    readonly cells: CellDto[];
    readonly metadata: NotebookDocumentMetadata;
}

export interface NotebookContributionData {
    extension?: string;
    providerDisplayName: string;
    displayName: string;
    filenamePattern: (string)[];
    exclusive: boolean;
}

export interface NotebookCellStatusBarItemList {
    items: NotebookCellStatusBarItem[];
    dispose?(): void;
}

export interface NotebookCellStatusBarItemProvider {
    viewType: string;
    onDidChangeStatusBarItems?: Event<void>;
    provideCellStatusBarItems(uri: UriComponents, index: number, token: CancellationToken): Promise<NotebookCellStatusBarItemList | undefined>;
}

export interface OutputItemDto {
    readonly mime: string;
    readonly data: BinaryBuffer;
}

export interface CellOutput {
    outputs: OutputItemDto[];
    metadata?: Record<string, unknown>;
    outputId: string;
    onDidChangeData: Event<void>;
    replaceData(items: OutputDto): void;
    appendData(items: OutputItemDto[]): void;
}

export interface Cell {
    readonly uri: URI;
    handle: number;
    language: string;
    cellKind: CellKind;
    outputs: CellOutput[];
    metadata: NotebookCellMetadata;
    internalMetadata: NotebookCellInternalMetadata;
    getHashValue(): number;
    textBuffer: string;
    onDidChangeOutputs?: Event<NotebookCellOutputsSplice>;
    onDidChangeOutputItems?: Event<void>;
    onDidChangeLanguage: Event<string>;
    onDidChangeMetadata: Event<void>;
    onDidChangeInternalMetadata: Event<CellInternalMetadataChangedEvent>;
}

export interface NotebookCellOutputsSplice {
    start: number /* start */;
    deleteCount: number /* delete count */;
    newOutputs: CellOutput[];
};

export interface CellInternalMetadataChangedEvent {
    readonly lastRunSuccessChanged?: boolean;
}
