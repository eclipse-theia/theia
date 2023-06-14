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

import { inject, injectable } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import * as Long from 'long';
import { MemoryTable, MemoryTableWidget } from '../memory-widget/memory-table-widget';
import { MemoryWidget } from '../memory-widget/memory-widget';
import { EasilyMappedObject } from '../utils/memory-hover-renderer';
import { Interfaces, MemoryDiffWidgetData } from '../utils/memory-widget-utils';
import { VariableDecoration, VariableFinder } from '../utils/memory-widget-variable-utils';
import { DiffMemoryOptions, MemoryDiffOptionsWidget } from './memory-diff-options-widget';
import { DiffExtraColumnOptions, DiffLabels, DiffRowOptions, RowData } from './memory-diff-widget-types';

export type MemoryDiffWidget = MemoryWidget<MemoryDiffOptionsWidget, MemoryDiffTableWidget>;
export namespace MemoryDiffWidget {
    export const ID = 'memory.diff.view';
    export const is = (widget: MemoryWidget): boolean => widget.optionsWidget instanceof MemoryDiffOptionsWidget;
}

interface DummyCounts {
    leading: number;
    trailing: number;
}

interface OffsetData {
    before: DummyCounts;
    after: DummyCounts;
}

@injectable()
export class MemoryDiffTableWidget extends MemoryTableWidget {
    @inject(MemoryDiffWidgetData) protected diffData: MemoryDiffWidgetData;
    @inject(MemoryDiffOptionsWidget) override readonly optionsWidget: MemoryDiffOptionsWidget;

    protected diffedSpanCounter = 0;
    protected beforeVariableFinder: VariableFinder;
    protected afterVariableFinder: VariableFinder;
    protected isHighContrast = false;
    protected override options: DiffMemoryOptions;
    protected offsetData: OffsetData;

    updateDiffData(newDiffData: Partial<MemoryDiffWidgetData>): void {
        this.optionsWidget.updateDiffData(newDiffData);
        this.diffData = { ...this.diffData, ...newDiffData };
        this.getStateAndUpdate();
    }

    protected override getState(): void {
        this.options = this.optionsWidget.options;
        this.isHighContrast = this.themeService.getCurrentTheme().type === 'hc';
        this.beforeVariableFinder = new VariableFinder(this.diffData.beforeVariables, this.isHighContrast);
        this.afterVariableFinder = new VariableFinder(this.diffData.afterVariables, this.isHighContrast);
        this.memory = { bytes: this.diffData.beforeBytes, address: new Long(0), variables: this.diffData.beforeVariables };
        this.offsetData = this.getOffsetData();
    }

    protected getOffsetData(): OffsetData {
        const offsetData: OffsetData = {
            before: {
                leading: this.options.beforeOffset * this.options.byteSize / 8,
                trailing: 0,
            },
            after: {
                leading: this.options.afterOffset * this.options.byteSize / 8,
                trailing: 0,
            },
        };
        this.setTrailing(offsetData);
        return offsetData;
    }

    protected setTrailing(offsetData: OffsetData): void {
        const totalBeforeLength = this.diffData.beforeBytes.length - offsetData.before.leading;
        const totalAfterLength = this.diffData.afterBytes.length - offsetData.after.leading;
        const totalDifference = totalBeforeLength - totalAfterLength;
        const realDifference = Math.abs(totalDifference);
        const beforeShorter = totalDifference < 0;
        if (beforeShorter) {
            offsetData.before.trailing = realDifference;
        } else {
            offsetData.after.trailing = realDifference;
        }
    }
    /* eslint-enable no-param-reassign */

    protected override getWrapperClass(): string {
        return `${super.getWrapperClass()} diff-table`;
    }

    protected override getTableHeaderClass(): string {
        return `${super.getTableHeaderClass()} diff-table`;
    }

    protected override *renderRows(): IterableIterator<React.ReactNode> {
        const bytesPerRow = this.options.bytesPerGroup * this.options.groupsPerRow;
        const oldGroupIterator = this.renderGroups(this.diffData.beforeBytes);
        const changeGroupIterator = this.renderGroups(this.diffData.afterBytes);
        let rowsYielded = 0;
        let before = this.getNewRowData();
        let after = this.getNewRowData();
        let isModified = false;
        for (const oldGroup of oldGroupIterator) {
            const nextChanged: IteratorResult<MemoryTable.GroupData, undefined> = changeGroupIterator.next();
            isModified = isModified || !!oldGroup.isHighlighted;
            this.aggregate(before, oldGroup);
            this.aggregate(after, nextChanged.value);
            if (before.groups.length === this.options.groupsPerRow || oldGroup.index === this.diffData.beforeBytes.length - 1) {
                const beforeID = this.diffData.beforeAddress.add(this.options.beforeOffset + (bytesPerRow * rowsYielded));
                const afterID = this.diffData.afterAddress.add(this.options.afterOffset + (bytesPerRow * rowsYielded));
                const beforeAddress = `0x${beforeID.toString(16)}`;
                const afterAddress = `0x${afterID.toString(16)}`;
                const doShowDivider = (rowsYielded % 4) === 3;
                yield this.renderSingleRow({ beforeAddress, afterAddress, doShowDivider, before, after, isModified });
                rowsYielded += 1;
                isModified = false;
                before = this.getNewRowData();
                after = this.getNewRowData();
            }
        }
    }

    protected renderSingleRow(
        options: DiffRowOptions,
        getRowAttributes: Interfaces.RowDecorator = this.getRowAttributes.bind(this),
    ): React.ReactNode {
        const { beforeAddress, afterAddress, before, after, isModified, doShowDivider } = options;
        const { className } = getRowAttributes({ doShowDivider });
        return (
            <tr key={beforeAddress} className={className}>
                <td className={MemoryTable.ADDRESS_DATA_CLASS}>{beforeAddress}</td>
                <td className={this.getDataCellClass('before', isModified)}>{before.groups}</td>
                <td className={MemoryTable.ADDRESS_DATA_CLASS}>{afterAddress}</td>
                <td className={this.getDataCellClass('after', isModified)}>{after.groups}</td>
                {this.getExtraColumn({
                    variables: before.variables.slice(),
                    ascii: before.ascii,
                    afterVariables: after.variables.slice(),
                    afterAscii: after.ascii,
                })}
            </tr>
        );
    }

    protected override getExtraColumn(options: DiffExtraColumnOptions): React.ReactNode[] {
        const additionalColumns = [];
        if (this.options.columnsDisplayed.variables.doRender) {
            additionalColumns.push(this.getDiffedVariables(options));
        }
        if (this.options.columnsDisplayed.ascii.doRender) {
            additionalColumns.push(this.getDiffedAscii(options));
        }
        return additionalColumns;
    }

    protected getDiffedAscii(options: DiffExtraColumnOptions): React.ReactNode {
        const { ascii: beforeAscii, afterAscii } = options;
        const highContrastClass = this.isHighContrast ? ' hc' : '';
        if (beforeAscii === afterAscii) {
            return super.getExtraColumn({ ascii: beforeAscii });
        }

        const EMPTY_TEXT = {
            before: '',
            after: '',
        };

        let currentText = { ...EMPTY_TEXT };

        const beforeSpans: React.ReactNode[] = [];
        const afterSpans: React.ReactNode[] = [];
        let lastWasSame = true;

        for (let i = 0; i < beforeAscii.length; i += 1) {
            const beforeLetter = beforeAscii[i];
            const afterLetter = afterAscii[i];
            const thisIsSame = beforeLetter === afterLetter;

            if (thisIsSame !== lastWasSame) {
                lastWasSame = thisIsSame;
                this.addTextBits(beforeSpans, afterSpans, currentText);
                currentText = { ...EMPTY_TEXT };
            }
            currentText.before += beforeLetter;
            currentText.after += afterLetter;
        }
        this.addTextBits(beforeSpans, afterSpans, currentText);
        return (
            <td key='ascii' className={MemoryTable.EXTRA_COLUMN_DATA_CLASS}>
                <span className={`different t-mv-diffed-ascii before${highContrastClass}`}>{beforeSpans}</span>
                <span className={`different t-mv-diffed-ascii after${highContrastClass}`}>{afterSpans}</span>
            </td>
        );
    }

    protected addTextBits(beforeSpans: React.ReactNode[], afterSpans: React.ReactNode[], texts: { before: string; after: string }): void {
        const [newBeforeSpans, newAfterSpans] = this.getAsciiSpan(texts);
        beforeSpans.push(newBeforeSpans);
        afterSpans.push(newAfterSpans);
    }

    protected getAsciiSpan({ before, after }: { before: string; after: string }): [React.ReactNode, React.ReactNode] {
        if (!before) {
            return [undefined, undefined];
        }
        const differentClass = before === after ? '' : 'different';
        const highContrastClass = this.isHighContrast ? ' hc' : '';
        // use non-breaking spaces so they show up in the diff.
        return [
            <span key={before + after + (this.diffedSpanCounter += 1)} className={`before ${differentClass}${highContrastClass}`}>
                {before.replace(/ /g, '\xa0')}
            </span>,
            <span key={before + after + (this.diffedSpanCounter += 1)} className={`after ${differentClass}${highContrastClass}`}>
                {after.replace(/ /g, '\xa0')}
            </span>,
        ];
    }

    protected getDiffedVariables(options: DiffExtraColumnOptions): React.ReactNode {
        const { variables: beforeVariables, afterVariables } = options;
        const variableSpans: React.ReactNode[] = [];

        let areDifferent = false;
        for (const beforeVariable of beforeVariables) {
            const placeInAfterVariables = afterVariables.findIndex(afterVariable => afterVariable.name === beforeVariable.name);
            if (placeInAfterVariables > -1) {
                afterVariables.splice(placeInAfterVariables, 1);
                variableSpans.push(this.getVariableSpan(beforeVariable, DiffLabels.Before, false));
            } else {
                areDifferent = true;
                variableSpans.push(this.getVariableSpan(beforeVariable, DiffLabels.Before, true));
            }
        }
        for (const afterVariable of afterVariables) {
            variableSpans.push(this.getVariableSpan(afterVariable, DiffLabels.After, true));
        }

        return <td key='variables' className={`${MemoryTable.EXTRA_COLUMN_DATA_CLASS}${areDifferent ? ' different' : ''}`}>{variableSpans}</td>;
    }

    protected getVariableSpan({ name, color }: VariableDecoration, origin: DiffLabels, isChanged: boolean): React.ReactNode {
        return (
            <span
                key={name}
                className={`t-mv-variable-label ${origin} ${isChanged ? ' different' : ''}`}
                style={{ color }}
            >
                {name}
            </span>
        );
    }

    protected getDataCellClass(modifier: 'before' | 'after', isModified?: boolean): string {
        const highContrastClass = this.isHighContrast ? 'hc' : '';
        let base = `${MemoryTable.MEMORY_DATA_CLASS} ${modifier} ${highContrastClass}`;
        if (isModified) {
            base += ' different';
        }
        return base;
    }

    protected getNewRowData(): RowData {
        return {
            groups: [],
            variables: [],
            ascii: '',
        };
    }

    protected aggregate(container: RowData, newData?: MemoryTable.GroupData): void {
        if (newData) {
            container.groups.push(newData.node);
            container.variables.push(...newData.variables);
            container.ascii += newData.ascii;
        }
    }

    protected override *renderArrayItems(
        iteratee: Interfaces.LabeledUint8Array = this.memory.bytes,
        getBitAttributes: Interfaces.BitDecorator = this.getBitAttributes.bind(this),
    ): IterableIterator<MemoryTable.ItemData> {
        let ignoredItems = 0;
        const iterateeOffsetData = iteratee.label === DiffLabels.Before ? this.offsetData.before : this.offsetData.after;
        for (const item of super.renderArrayItems(iteratee, getBitAttributes)) {
            if (ignoredItems < iterateeOffsetData.leading) {
                ignoredItems += 1;
                continue;
            }
            yield item;
        }
        for (let i = 0; i < iterateeOffsetData.trailing; i += 1) {
            yield this.getDummySpan(i);
        }
    }

    protected getDummySpan(key: number): MemoryTable.ItemData {
        const node = <span key={key}>{'\xa0'.repeat(2)}</span>;
        return {
            node,
            content: '',
            index: -1 * key,
        };
    }

    protected override getBitAttributes(arrayOffset: number, iteratee: Interfaces.LabeledUint8Array): Partial<Interfaces.FullNodeAttributes> {
        const isHighlighted = this.getHighlightStatus(arrayOffset, iteratee);
        const content = iteratee[arrayOffset].toString(16).padStart(2, '0');
        let className = `${MemoryTable.EIGHT_BIT_SPAN_CLASS} ${iteratee.label ?? ''}`;
        const highContrastClass = this.isHighContrast ? 'hc' : '';
        if (isHighlighted) {
            className += ` different ${highContrastClass}`;
        }

        const isBeforeChunk = iteratee.label === DiffLabels.Before;
        const baseAddress = isBeforeChunk ? this.diffData.beforeAddress : this.diffData.afterAddress;
        const itemAddress = baseAddress.add(arrayOffset * 8 / this.options.byteSize);

        const variable = isBeforeChunk
            ? this.beforeVariableFinder.getVariableForAddress(itemAddress)
            : this.afterVariableFinder.getVariableForAddress(itemAddress);

        return { className, content, isHighlighted, variable, style: { color: variable?.color } };
    }

    protected getHighlightStatus(arrayOffset: number, iteratee: Interfaces.LabeledUint8Array): boolean {
        const source = iteratee.label === DiffLabels.Before ? DiffLabels.Before : DiffLabels.After;
        const targetArray = source === DiffLabels.Before ? this.diffData.afterBytes : this.diffData.beforeBytes;
        const sourceValue = iteratee[arrayOffset];
        const targetIndex = this.translateBetweenShiftedArrays(arrayOffset, source);
        const targetValue = targetArray[targetIndex];
        return sourceValue !== undefined &&
            targetValue !== undefined &&
            sourceValue !== targetValue;
    }

    protected translateBetweenShiftedArrays(sourceIndex: number, source: DiffLabels): number {
        const sourceOffsets = source === DiffLabels.Before ? this.offsetData.before : this.offsetData.after;
        const targetOffsets = source === DiffLabels.Before ? this.offsetData.after : this.offsetData.before;

        return sourceIndex - sourceOffsets.leading + targetOffsets.leading;
    }

    protected override getHoverForVariable(span: HTMLElement): EasilyMappedObject | undefined {
        const name = span.textContent ?? '';
        const variable = this.beforeVariableFinder.searchForVariable(name) ??
            this.afterVariableFinder.searchForVariable(name);

        if (variable?.type) {
            return { type: variable.type };
        }
        return undefined;
    }
}
