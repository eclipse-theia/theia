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
    // getHashValue(): number;
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

export type NotebookCellTextModelSplice<T> = [
    start: number,
    deleteCount: number,
    newItems: T[]
];

export enum NotebookCellsChangeType {
    ModelChange = 1,
    Move = 2,
    ChangeCellLanguage = 5,
    Initialize = 6,
    ChangeCellMetadata = 7,
    Output = 8,
    OutputItem = 9,
    ChangeCellContent = 10,
    ChangeDocumentMetadata = 11,
    ChangeCellInternalMetadata = 12,
    // ChangeCellMime = 13,
    Unknown = 100
}

export interface NotebookCellsInitializeEvent<T> {
    readonly kind: NotebookCellsChangeType.Initialize;
    readonly changes: NotebookCellTextModelSplice<T>[];
}

export interface NotebookCellsChangeLanguageEvent {
    readonly kind: NotebookCellsChangeType.ChangeCellLanguage;
    readonly index: number;
    readonly language: string;
}

export interface NotebookCellsModelChangedEvent<T> {
    readonly kind: NotebookCellsChangeType.ModelChange;
    readonly changes: NotebookCellTextModelSplice<T>[];
}

export interface NotebookCellsModelMoveEvent<T> {
    readonly kind: NotebookCellsChangeType.Move;
    readonly index: number;
    readonly length: number;
    readonly newIdx: number;
    readonly cells: T[];
}

export interface NotebookOutputChangedEvent {
    readonly kind: NotebookCellsChangeType.Output;
    readonly index: number;
    readonly outputs: OutputDto[];
    readonly append: boolean;
}

export interface NotebookOutputItemChangedEvent {
    readonly kind: NotebookCellsChangeType.OutputItem;
    readonly index: number;
    readonly outputId: string;
    readonly outputItems: OutputItemDto[];
    readonly append: boolean;
}
export interface NotebookCellsChangeMetadataEvent {
    readonly kind: NotebookCellsChangeType.ChangeCellMetadata;
    readonly index: number;
    readonly metadata: NotebookCellMetadata;
}

export interface NotebookCellsChangeInternalMetadataEvent {
    readonly kind: NotebookCellsChangeType.ChangeCellInternalMetadata;
    readonly index: number;
    readonly internalMetadata: NotebookCellInternalMetadata;
}

export interface NotebookDocumentChangeMetadataEvent {
    readonly kind: NotebookCellsChangeType.ChangeDocumentMetadata;
    readonly metadata: NotebookDocumentMetadata;
}

export interface NotebookDocumentUnknownChangeEvent {
    readonly kind: NotebookCellsChangeType.Unknown;
}

export interface NotebookCellContentChangeEvent {
    readonly kind: NotebookCellsChangeType.ChangeCellContent;
    readonly index: number;
}

export type NotebookRawContentEvent = (NotebookCellsInitializeEvent<Cell> | NotebookDocumentChangeMetadataEvent | NotebookCellContentChangeEvent |
    NotebookCellsModelChangedEvent<Cell> | NotebookCellsModelMoveEvent<Cell> | NotebookOutputChangedEvent | NotebookOutputItemChangedEvent |
    NotebookCellsChangeLanguageEvent | NotebookCellsChangeMetadataEvent |
    NotebookCellsChangeInternalMetadataEvent | NotebookDocumentUnknownChangeEvent) & { transient: boolean };

export interface NotebookModelChangedEvent {
    readonly rawEvents: NotebookRawContentEvent[];
    readonly versionId: number;
    // readonly synchronous: boolean | undefined;
    // readonly endSelectionState: ISelectionState | undefined;
};

export interface NotebookModelWillAddRemoveEvent {
    readonly rawEvent: NotebookCellsModelChangedEvent<Cell>;
};

export namespace CellUri {

    export const scheme = 'vscode-notebook-cell';

    const _lengths = ['W', 'X', 'Y', 'Z', 'a', 'b', 'c', 'd', 'e', 'f'];
    const _padRegexp = new RegExp(`^[${_lengths.join('')}]+`);
    const _radix = 7;

    export function generate(notebook: URI, handle: number): URI {

        const s = handle.toString(_radix);
        const p = s.length < _lengths.length ? _lengths[s.length - 1] : 'z';

        const fragment = `${p}${s}s${Buffer.from(BinaryBuffer.fromString(notebook.scheme).buffer).toString('base64')} `;
        return notebook.withScheme(scheme).withFragment(fragment);
    }

    export function parse(cell: URI): { notebook: URI; handle: number } | undefined {
        if (cell.scheme !== scheme) {
            return undefined;
        }

        const idx = cell.fragment.indexOf('s');
        if (idx < 0) {
            return undefined;
        }

        const handle = parseInt(cell.fragment.substring(0, idx).replace(_padRegexp, ''), _radix);
        const parsedScheme = Buffer.from(cell.fragment.substring(idx + 1), 'base64').toString();

        if (isNaN(handle)) {
            return undefined;
        }
        return {
            handle,
            notebook: cell.withScheme(parsedScheme).withoutFragment()
        };
    }

    // export function generateCellOutputUri(notebook: URI, outputId?: string) {
    //     return notebook.with({
    //         scheme: NOTEBOOK_CELL_URI_SCHEME,
    //         fragment: `op${outputId ?? ''},${notebook.scheme !== Schemas.file ? notebook.scheme : ''} `
    //     });
    // }

    // export function parseCellOutputUri(uri: URI): { notebook: URI; outputId?: string } | undefined {
    //     if (uri.scheme !== NOTEBOOK_CELL_URI_SCHEME) {
    //         return;
    //     }

    //     const match = /^op([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?\,(.*)$/i.exec(uri.fragment);
    //     if (!match) {
    //         return undefined;
    //     }

    //     const outputId = (match[1] && match[1] !== '') ? match[1] : undefined;
    //     const scheme = match[2];
    //     return {
    //         outputId,
    //         notebook: uri.with({
    //             scheme: scheme || Schemas.file,
    //             fragment: null
    //         })
    //     };
    // }

    export function generateCellPropertyUri(notebook: URI, handle: number, cellScheme: string): URI {
        return CellUri.generate(notebook, handle).withScheme(cellScheme);
    }

    export function parseCellPropertyUri(uri: URI, propertyScheme: string): { notebook: URI; handle: number } | undefined {
        if (uri.scheme !== propertyScheme) {
            return undefined;
        }

        return CellUri.parse(uri.withScheme(scheme));
    }
}
