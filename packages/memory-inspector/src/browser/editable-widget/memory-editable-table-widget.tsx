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
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { Key, KeyCode } from '@theia/core/lib/browser';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { MemoryTableWidget, MemoryTable } from '../memory-widget/memory-table-widget';
import { EasilyMappedObject } from '../utils/memory-hover-renderer';
import { Interfaces } from '../utils/memory-widget-utils';
import * as Long from 'long';
import { hexStrToUnsignedLong } from '../../common/util';
import { MemoryWidget } from '../memory-widget/memory-widget';
import { MemoryOptionsWidget } from '../memory-widget/memory-options-widget';
import * as Array64 from 'base64-arraybuffer';
import { DebugProtocol } from 'vscode-debugprotocol';

export type EditableMemoryWidget = MemoryWidget<MemoryOptionsWidget, MemoryEditableTableWidget>;
export namespace EditableMemoryWidget {
    export const ID = 'editable.memory.widget';
}

@injectable()
export class MemoryEditableTableWidget extends MemoryTableWidget {
    protected pendingMemoryEdits = new Map<Long, string>();
    protected previousBytes: Interfaces.LabeledUint8Array | undefined;
    protected memoryEditsCompleted = new Deferred<void>();
    protected highlightedField: Long = Long.fromInt(-1);

    protected doShowMoreMemoryBefore = false;
    protected doShowMoreMemoryAfter = false;

    @postConstruct()
    protected async init(): Promise<void> {
        this.memoryEditsCompleted.resolve();
        await super.init();
    }

    resetModifiedValue(valueAddress: Long): void {
        const didChange = this.pendingMemoryEdits.delete(valueAddress);
        if (didChange) {
            this.update();
        }
    }

    protected getState(): void {
        super.getState();
        if (!this.isInBounds(this.highlightedField)) {
            this.highlightedField = this.memory.address;
        }
    }

    protected async handleMemoryChange(newMemory: Interfaces.MemoryReadResult): Promise<void> {
        await this.memoryEditsCompleted.promise;
        this.pendingMemoryEdits.clear();
        super.handleMemoryChange(newMemory);
    }

    protected areSameRegion(a: Interfaces.MemoryReadResult, b?: Interfaces.MemoryReadResult): boolean {
        return a.address === b?.address && a.bytes.length === b.bytes.length;
    }

    protected getTableFooter(): React.ReactNode {
        return (
            !!this.pendingMemoryEdits.size && (
                <div className='memory-edit-button-container'>
                    <button
                        className='theia-button secondary'
                        onClick={this.handleClearEditClick}
                        type='reset'
                    >
                        Clear Changes
                    </button>
                    <button
                        className='theia-button main'
                        onClick={this.submitMemoryEdits}
                        type='submit'
                    >
                        Apply Changes
                    </button>
                </div>)
        );
    }

    protected getBitAttributes(arrayOffset: number, iteratee: Interfaces.LabeledUint8Array): Partial<Interfaces.FullNodeAttributes> {
        const attributes = super.getBitAttributes(arrayOffset, iteratee);
        const classNames = attributes.className?.split(' ') ?? [];
        const itemID = this.memory.address.add(arrayOffset);
        const isHighlight = itemID === this.highlightedField;
        const isEditPending = this.pendingMemoryEdits.has(itemID);
        const padder = isHighlight && isEditPending ? '\xa0' : '0'; // non-breaking space so it doesn't look like plain whitespace.
        const stringValue = (this.pendingMemoryEdits.get(itemID) ?? this.memory.bytes[arrayOffset].toString(16)).padStart(2, padder);
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

    protected getHoverForChunk(span: HTMLElement): EasilyMappedObject | undefined {
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
        const address = this.memory.address.add(startingChunkIndex.multiply(8 / this.options.byteSize));

        for (let i = 0; i < chunksPerByte; i += 1) {
            const targetOffset = startingChunkIndex.add(i);
            const targetChunk = this.getFromMapOrArray(targetOffset, usePendingEdits, dataSource);
            value += targetChunk.padStart(2, '0');
        }

        return { address, value };
    }

    protected getFromMapOrArray(arrayOffset: Long, usePendingEdits: boolean, dataSource: Uint8Array = this.memory.bytes): string {
        let value = usePendingEdits ? this.pendingMemoryEdits.get(arrayOffset.add(this.memory.address)) : undefined;
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
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of this.submitMemoryEditInOrder()) {
            // Do nothing, but without lint errors.
        }
    };

    private * submitMemoryEditInOrder(): IterableIterator<Promise<DebugProtocol.WriteMemoryResponse | undefined>> {
        this.memoryEditsCompleted = new Deferred();
        const addressesSubmitted = new Set<Long>();
        for (const address of this.pendingMemoryEdits.keys()) {
            const { address: addressToSend, value: valueToSend } = this.composeByte(address, true);
            if (!addressesSubmitted.has(addressToSend)) {
                const data = Array64.encode(new Uint8Array([parseInt(valueToSend, 16)]));
                const writeMemoryArguments = { memoryReference: addressToSend.toString(), data };
                yield this.memoryProvider.writeMemory?.(writeMemoryArguments) ?? Promise.resolve(undefined);
                addressesSubmitted.add(addressToSend);
            }
        }
        this.memoryEditsCompleted.resolve();
    }

    protected getWrapperHandlers(): MemoryTable.WrapperHandlers {
        return this.options.isFrozen
            ? super.getWrapperHandlers()
            : {
                onClick: this.handleTableClick,
                onContextMenu: this.handleTableRightClick,
                onKeyDown: this.handleTableInput,
                onMouseMove: this.handleTableMouseMove,
            };
    }

    private handleTableClick = (event: React.MouseEvent): void => {
        const target = event.target as HTMLElement;
        if (target.classList?.contains('eight-bits')) {
            this.highlightedField = hexStrToUnsignedLong(target.getAttribute('data-id') ?? '-0x1');
            this.update();
            event.stopPropagation();
        }
    };

    protected doHandleTableRightClick(event: React.MouseEvent): void {
        const target = event.target as HTMLElement;
        if (target.classList?.contains('eight-bits')) {
            this.highlightedField = hexStrToUnsignedLong(target.getAttribute('data-id') ?? '-0x1');
        }
        super.doHandleTableRightClick(event);
    }

    // eslint-disable-next-line max-lines-per-function,complexity
    private handleTableInput = (event: React.KeyboardEvent): void => {
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
        const isAlreadyEdited = this.pendingMemoryEdits.has(this.highlightedField);
        const oldValue = this.pendingMemoryEdits.get(initialHighlight) ??
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
            this.pendingMemoryEdits.set(this.highlightedField, newValue);
        }
        if (valueWasChanged || this.highlightedField !== initialHighlight) {
            this.update();
        }
    };

    private isInBounds(candidateAddress: Long): boolean {
        const { address, bytes } = this.memory;
        return candidateAddress.greaterThanOrEqual(address) &&
            candidateAddress.lessThan(address.add(bytes.length));
    }
}
