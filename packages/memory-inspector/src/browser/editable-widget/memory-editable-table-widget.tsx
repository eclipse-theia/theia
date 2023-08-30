/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
 ********************************************************************************/

import { Key, KeyCode } from '@theia/core/lib/browser';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { injectable } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import * as Long from 'long';
import { DebugProtocol } from '@vscode/debugprotocol';
import { hexStrToUnsignedLong } from '../../common/util';
import { MemoryOptionsWidget } from '../memory-widget/memory-options-widget';
import { MemoryTable, MemoryTableWidget } from '../memory-widget/memory-table-widget';
import { MemoryWidget } from '../memory-widget/memory-widget';
import { EasilyMappedObject } from '../utils/memory-hover-renderer';
import { Constants, Interfaces } from '../utils/memory-widget-utils';
import { nls } from '@theia/core/lib/common/nls';

export type EditableMemoryWidget = MemoryWidget<MemoryOptionsWidget, MemoryEditableTableWidget>;
export namespace EditableMemoryWidget {
    export const ID = 'editable.memory.widget';
}

@injectable()
export class MemoryEditableTableWidget extends MemoryTableWidget {
    protected pendingMemoryEdits = new Map<string, string>();
    protected override previousBytes: Interfaces.LabeledUint8Array | undefined;
    protected memoryEditsCompleted = new Deferred<void>();
    protected highlightedField: Long = Long.fromInt(-1);
    protected writeErrorInfo: { location: string, error: string } | undefined;
    protected currentErrorTimeout: number | undefined;

    protected doShowMoreMemoryBefore = false;
    protected doShowMoreMemoryAfter = false;

    protected override async doInit(): Promise<void> {
        this.memoryEditsCompleted.resolve();
        await super.doInit();
        this.addClass('editable');
    }

    resetModifiedValue(valueAddress: Long): void {
        const didChange = this.pendingMemoryEdits.delete(valueAddress.toString());
        if (didChange) {
            this.update();
        }
    }

    protected override getState(): void {
        super.getState();
        if (!this.isInBounds(this.highlightedField)) {
            this.highlightedField = this.memory.address;
        }
    }

    protected override async handleMemoryChange(newMemory: Interfaces.MemoryReadResult): Promise<void> {
        await this.memoryEditsCompleted.promise;
        if (newMemory.bytes.length === 0) {
            this.pendingMemoryEdits.clear();
        }
        super.handleMemoryChange(newMemory);
    }

    protected override areSameRegion(a: Interfaces.MemoryReadResult, b?: Interfaces.MemoryReadResult): boolean {
        return b !== undefined && a.address.equals(b.address) && a.bytes.length === b.bytes.length;
    }

    protected override getTableFooter(): React.ReactNode {
        const showButtons = !!this.pendingMemoryEdits.size && !this.writeErrorInfo;
        return (
            (showButtons || this.writeErrorInfo) && (
                <div className='memory-edit-button-container'>
                    {showButtons && <button
                        className='theia-button secondary'
                        onClick={this.handleClearEditClick}
                        type='reset'
                        title={nls.localize('theia/memory-inspector/editable/clear', 'Clear Changes')}
                    >
                        {nls.localize('theia/memory-inspector/editable/clear', 'Clear Changes')}
                    </button>}
                    {showButtons && <button
                        className='theia-button main'
                        onClick={this.submitMemoryEdits}
                        type='submit'
                        title={nls.localize('theia/memory-inspector/editable/apply', 'Apply Changes')}
                    >
                        {nls.localize('theia/memory-inspector/editable/apply', 'Apply Changes')}
                    </button>}
                    {!!this.writeErrorInfo && <div className='memory-edit-error'>
                        <div className='memory-edit-error-location'>{`Error writing to 0x${Long.fromString(this.writeErrorInfo?.location).toString(16)}`}</div>
                        <div className='memory-edit-error-details'>{this.writeErrorInfo?.error}</div>
                    </div>}
                </div>)
        );
    }

    protected override getBitAttributes(arrayOffset: number, iteratee: Interfaces.LabeledUint8Array): Partial<Interfaces.FullNodeAttributes> {
        const attributes = super.getBitAttributes(arrayOffset, iteratee);
        const classNames = attributes.className?.split(' ') ?? [];
        const itemID = this.memory.address.add(arrayOffset);
        const isHighlight = itemID.equals(this.highlightedField);
        const isEditPending = this.pendingMemoryEdits.has(itemID.toString());
        const padder = isHighlight && isEditPending ? '\xa0' : '0'; // non-breaking space so it doesn't look like plain whitespace.
        const stringValue = (this.pendingMemoryEdits.get(itemID.toString()) ?? this.memory.bytes[arrayOffset].toString(16)).padStart(2, padder);
        if (!this.options.isFrozen) {
            if (isHighlight) {
                classNames.push('highlight');
            }
            if (isEditPending) {
                classNames.push('modified');
            }
        }
        return {
            ...attributes,
            className: classNames.join(' '),
            content: stringValue
        };
    }

    protected override getHoverForChunk(span: HTMLElement): EasilyMappedObject | undefined {
        const addressAsString = span.getAttribute('data-id');
        if (addressAsString) {
            const address = hexStrToUnsignedLong(addressAsString);
            const { value } = this.composeByte(address, true);
            const { value: inMemory } = this.composeByte(address, false);
            const oldValue = this.previousBytes && this.composeByte(address, false, this.previousBytes).value;
            const decimal = parseInt(value, 16);
            const octal = decimal.toString(8).padStart(this.options.byteSize / 8, '0');
            const UTF8 = String.fromCharCode(decimal);
            const binary = this.getPaddedBinary(decimal);
            const toSend: EasilyMappedObject = { hex: value, octal, binary, decimal };
            if (UTF8) {
                toSend.UTF8 = UTF8;
            }
            if (inMemory !== value) {
                toSend['Current Value'] = inMemory;
            }
            if (oldValue !== undefined && oldValue !== value) {
                toSend['Previous Value'] = oldValue;
            }
            return toSend;
        }
        return undefined;
    }

    protected composeByte(
        addressPlusArrayOffset: Long,
        usePendingEdits: boolean,
        dataSource: Uint8Array = this.memory.bytes,
    ): Interfaces.ByteFromChunkData {
        let value = '';

        const offset = addressPlusArrayOffset.subtract(this.memory.address);
        const chunksPerByte = this.options.byteSize / 8;
        const startingChunkIndex = offset.subtract(offset.modulo(chunksPerByte));
        const address = this.memory.address.add(startingChunkIndex.divide(chunksPerByte));
        for (let i = 0; i < chunksPerByte; i += 1) {
            const targetOffset = startingChunkIndex.add(i);
            const targetChunk = this.getFromMapOrArray(targetOffset, usePendingEdits, dataSource);
            value += targetChunk.padStart(2, '0');
        }

        return { address, value };
    }

    protected getFromMapOrArray(arrayOffset: Long, usePendingEdits: boolean, dataSource: Uint8Array = this.memory.bytes): string {
        let value = usePendingEdits ? this.pendingMemoryEdits.get(arrayOffset.add(this.memory.address).toString()) : undefined;
        if (value === undefined) {
            value = dataSource[arrayOffset.toInt()]?.toString(16) ?? '';
        }
        return value;
    }

    protected handleClearEditClick = (): void => this.clearEdits();

    protected clearEdits(address?: Long): void {
        if (typeof address === 'number') {
            this.pendingMemoryEdits.delete(address);
        } else {
            this.pendingMemoryEdits.clear();
        }
        this.update();
    }

    protected submitMemoryEdits = async (): Promise<void> => {
        this.memoryEditsCompleted = new Deferred();
        let didUpdateMemory = false;
        for (const [key, edit] of this.createUniqueEdits()) {
            try {
                await this.doWriteMemory(edit);
                didUpdateMemory = true;
                this.pendingMemoryEdits.delete(key);
            } catch (e) {
                console.warn('Problem writing memory with arguments', edit, '\n', e);
                const text = e instanceof Error ? e.message : 'Unknown error';
                this.showWriteError(key, text);
                break;
            }
        }
        this.memoryEditsCompleted.resolve();
        if (didUpdateMemory) {
            this.optionsWidget.fetchNewMemory();
        }
    };

    protected createUniqueEdits(): Array<[string, DebugProtocol.WriteMemoryArguments]> {
        const addressesSubmitted = new Set<string>();
        const edits: Array<[string, DebugProtocol.WriteMemoryArguments]> = [];
        for (const k of this.pendingMemoryEdits.keys()) {
            const address = Long.fromString(k);
            const { address: addressToSend, value: valueToSend } = this.composeByte(address, true);
            const memoryReference = '0x' + addressToSend.toString(16);
            if (!addressesSubmitted.has(memoryReference)) {
                const data = Buffer.from(valueToSend, 'hex').toString('base64');
                edits.push([k, { memoryReference, data }]);
                addressesSubmitted.add(memoryReference);
            }
        }
        return edits;
    }

    protected doWriteMemory(writeMemoryArgs: DebugProtocol.WriteMemoryArguments): Promise<DebugProtocol.WriteMemoryResponse> {
        return this.memoryProvider.writeMemory(writeMemoryArgs);
    }

    protected showWriteError(location: string, error: string): void {
        if (this.currentErrorTimeout !== undefined) {
            clearTimeout(this.currentErrorTimeout);
        }
        this.writeErrorInfo = { location, error };
        this.update();
        this.currentErrorTimeout = window.setTimeout(() => this.hideWriteError(), Constants.ERROR_TIMEOUT);
    }

    protected hideWriteError(): void {
        this.currentErrorTimeout = undefined;
        this.writeErrorInfo = undefined;
        this.update();
    }

    protected override getWrapperHandlers(): MemoryTable.WrapperHandlers {
        return this.options.isFrozen
            ? super.getWrapperHandlers()
            : {
                onClick: this.handleTableClick,
                onContextMenu: this.handleTableRightClick,
                onKeyDown: this.handleTableInput,
                onMouseMove: this.handleTableMouseMove,
            };
    }

    protected handleTableClick = (event: React.MouseEvent): void => {
        const target = event.target as HTMLElement;
        if (target.classList?.contains('eight-bits')) {
            this.highlightedField = hexStrToUnsignedLong(target.getAttribute('data-id') ?? '-0x1');
            this.update();
            event.stopPropagation();
        }
    };

    protected override doHandleTableRightClick(event: React.MouseEvent): void {
        const target = event.target as HTMLElement;
        if (target.classList?.contains('eight-bits')) {
            this.highlightedField = hexStrToUnsignedLong(target.getAttribute('data-id') ?? '-0x1');
        }
        super.doHandleTableRightClick(event);
    }

    protected handleTableInput = (event: React.KeyboardEvent): void => {
        if (this.highlightedField.lessThan(0)) {
            return;
        }
        const keyCode = KeyCode.createKeyCode(event.nativeEvent).key?.keyCode;
        const initialHighlight = this.highlightedField;
        const initialHighlightIndex = initialHighlight.subtract(this.memory.address);
        if (keyCode === Key.TAB.keyCode) {
            return;
        }
        const arrayElementsPerRow = (this.options.byteSize / 8) * this.options.bytesPerGroup * this.options.groupsPerRow;
        const isAlreadyEdited = this.pendingMemoryEdits.has(this.highlightedField.toString());
        const oldValue = this.pendingMemoryEdits.get(initialHighlight.toString()) ??
            this.memory.bytes[initialHighlightIndex.toInt()].toString(16).padStart(2, '0');
        let possibleNewHighlight = new Long(-1);
        let newValue = oldValue;
        switch (keyCode) {
            case Key.ARROW_DOWN.keyCode:
                possibleNewHighlight = initialHighlight.add(arrayElementsPerRow);
                event.preventDefault();
                event.stopPropagation();
                break;
            case Key.ARROW_UP.keyCode:
                possibleNewHighlight = initialHighlight.greaterThan(arrayElementsPerRow) ? initialHighlight.subtract(arrayElementsPerRow) : possibleNewHighlight;
                event.preventDefault();
                event.stopPropagation();
                break;
            case Key.ARROW_RIGHT.keyCode:
                possibleNewHighlight = initialHighlight.add(1);
                event.preventDefault();
                event.stopPropagation();
                break;
            case Key.ARROW_LEFT.keyCode:
                possibleNewHighlight = initialHighlight.greaterThan(0) ? initialHighlight.subtract(1) : possibleNewHighlight;
                break;
            case Key.BACKSPACE.keyCode:
                newValue = oldValue.slice(0, oldValue.length - 1);
                break;
            case Key.DELETE.keyCode:
                newValue = '';
                break;
            case Key.ENTER.keyCode:
                this.submitMemoryEdits();
                break;
            case Key.ESCAPE.keyCode:
                if (isAlreadyEdited) {
                    this.clearEdits(this.highlightedField);
                } else {
                    this.clearEdits();
                }
                break;
            default: {
                const keyValue = parseInt(KeyCode.createKeyCode(event.nativeEvent).toString(), 16);
                if (!Number.isNaN(keyValue)) {
                    newValue = isAlreadyEdited ? oldValue : '';
                    if (newValue.length < 2) {
                        newValue += keyValue.toString(16);
                    }
                }
            }
        }
        if (this.isInBounds(possibleNewHighlight)) {
            this.highlightedField = possibleNewHighlight;
        }
        const valueWasChanged = newValue !== oldValue;
        if (valueWasChanged) {
            this.pendingMemoryEdits.set(this.highlightedField.toString(), newValue);
        }
        if (valueWasChanged || !this.highlightedField.equals(initialHighlight)) {
            this.update();
        }
    };

    protected isInBounds(candidateAddress: Long): boolean {
        const { address, bytes } = this.memory;
        return candidateAddress.greaterThanOrEqual(address) &&
            candidateAddress.lessThan(address.add(bytes.length));
    }
}
