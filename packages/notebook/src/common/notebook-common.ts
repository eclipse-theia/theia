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

import { Command, URI, isObject } from '@theia/core';
import { MarkdownString } from '@theia/core/lib/common/markdown-rendering/markdown-string';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { UriComponents } from '@theia/core/lib/common/uri';

export interface NotebookCommand extends Command {
    title?: string;
    tooltip?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    arguments?: any[];
}

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

export interface CellOutputItem {
    readonly mime: string;
    readonly data: BinaryBuffer;
}

export interface CellOutput {
    outputId: string;
    outputs: CellOutputItem[];
    metadata?: Record<string, unknown>;
}

export interface NotebookCellCollapseState {
    inputCollapsed?: boolean;
    outputCollapsed?: boolean;
}

export interface CellData {
    source: string;
    language: string;
    cellKind: CellKind;
    outputs: CellOutput[];
    metadata?: NotebookCellMetadata;
    internalMetadata?: NotebookCellInternalMetadata;
    collapseState?: NotebookCellCollapseState;
}

export interface NotebookDocumentMetadataEdit {
    editType: CellEditType.DocumentMetadata;
    metadata: NotebookDocumentMetadata;
}

export interface NotebookData {
    readonly cells: CellData[];
    readonly metadata: NotebookDocumentMetadata;
}

export interface NotebookContributionData {
    extension?: string;
    providerDisplayName: string;
    displayName: string;
    filenamePattern: (string)[];
    exclusive: boolean;
}

export interface NotebookCellTextModelSplice<T> {
    start: number,
    deleteCount: number,
    newItems: T[]
};

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

export interface NotebookCellsChangeLanguageEvent {
    readonly kind: NotebookCellsChangeType.ChangeCellLanguage;
    readonly index: number;
    readonly language: string;
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

export interface NotebookCellContentChangeEvent {
    readonly kind: NotebookCellsChangeType.ChangeCellContent;
    readonly index: number;
}

export interface NotebookModelResource {
    notebookModelUri: URI;
}

export namespace NotebookModelResource {
    export function is(item: unknown): item is NotebookModelResource {
        return isObject<NotebookModelResource>(item) && item.notebookModelUri instanceof URI;
    }
    export function create(uri: URI): NotebookModelResource {
        return { notebookModelUri: uri };
    }
}

export interface NotebookCellModelResource {
    notebookCellModelUri: URI;
}

export namespace NotebookCellModelResource {
    export function is(item: unknown): item is NotebookCellModelResource {
        return isObject<NotebookCellModelResource>(item) && item.notebookCellModelUri instanceof URI;
    }
    export function create(uri: URI): NotebookCellModelResource {
        return { notebookCellModelUri: uri };
    }
}

export enum NotebookCellExecutionState {
    Unconfirmed = 1,
    Pending = 2,
    Executing = 3
}

export enum CellExecutionUpdateType {
    Output = 1,
    OutputItems = 2,
    ExecutionState = 3,
}

export interface CellExecuteOutputEdit {
    editType: CellExecutionUpdateType.Output;
    cellHandle: number;
    append?: boolean;
    outputs: CellOutput[];
}

export interface CellExecuteOutputItemEdit {
    editType: CellExecutionUpdateType.OutputItems;
    append?: boolean;
    outputId: string,
    items: CellOutputItem[];
}

export interface CellExecutionStateUpdateDto {
    editType: CellExecutionUpdateType.ExecutionState;
    executionOrder?: number;
    runStartTime?: number;
    didPause?: boolean;
    isPaused?: boolean;
}

export interface CellMetadataEdit {
    editType: CellEditType.Metadata;
    index: number;
    metadata: NotebookCellMetadata;
}

export const enum CellEditType {
    Replace = 1,
    Output = 2,
    Metadata = 3,
    CellLanguage = 4,
    DocumentMetadata = 5,
    Move = 6,
    OutputItems = 7,
    PartialMetadata = 8,
    PartialInternalMetadata = 9,
}

export interface NotebookKernelSourceAction {
    readonly label: string;
    readonly description?: string;
    readonly detail?: string;
    readonly command?: string | Command;
    readonly documentation?: UriComponents | string;
}

/**
 * Whether the provided mime type is a text stream like `stdout`, `stderr`.
 */
export function isTextStreamMime(mimeType: string): boolean {
    return ['application/vnd.code.notebook.stdout', 'application/vnd.code.notebook.stderr'].includes(mimeType);
}

export namespace CellUri {

    export const cellUriScheme = 'vscode-notebook-cell';
    export const outputUriScheme = 'vscode-notebook-cell-output';

    const _lengths = ['W', 'X', 'Y', 'Z', 'a', 'b', 'c', 'd', 'e', 'f'];
    const _padRegexp = new RegExp(`^[${_lengths.join('')}]+`);
    const _radix = 7;

    export function generate(notebook: URI, handle: number): URI {

        const s = handle.toString(_radix);
        const p = s.length < _lengths.length ? _lengths[s.length - 1] : 'z';

        const fragment = `${p}${s}s${Buffer.from(BinaryBuffer.fromString(notebook.scheme).buffer).toString('base64')}`;
        return notebook.withScheme(cellUriScheme).withFragment(fragment);
    }

    export function parse(cell: URI): { notebook: URI; handle: number } | undefined {
        if (cell.scheme !== cellUriScheme) {
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

    export function generateCellOutputUri(notebook: URI, outputId?: string): URI {
        return notebook
            .withScheme(outputUriScheme)
            .withQuery(`op${outputId ?? ''},${notebook.scheme !== 'file' ? notebook.scheme : ''}`);
    };

    export function parseCellOutputUri(uri: URI): { notebook: URI; outputId?: string } | undefined {
        if (uri.scheme !== outputUriScheme) {
            return;
        }

        const match = /^op([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?\,(.*)$/i.exec(uri.query);
        if (!match) {
            return undefined;
        }

        const outputId = match[1] || undefined;
        const scheme = match[2];
        return {
            outputId,
            notebook: uri.withScheme(scheme || 'file').withoutQuery()
        };
    }

    export function generateCellPropertyUri(notebook: URI, handle: number, cellScheme: string): URI {
        return CellUri.generate(notebook, handle).withScheme(cellScheme);
    }

    export function parseCellPropertyUri(uri: URI, propertyScheme: string): { notebook: URI; handle: number } | undefined {
        if (uri.scheme !== propertyScheme) {
            return undefined;
        }

        return CellUri.parse(uri.withScheme(cellUriScheme));
    }
}
