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

import { Key, KeyCode, Message, ReactWidget } from '@theia/core/lib/browser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import * as Long from 'long';
import { MemoryWidget } from '../memory-widget/memory-widget';
import { RegisterWidget } from '../register-widget/register-widget-types';
import { MWSelect } from '../utils/memory-widget-components';
import { MemoryWidgetManager } from '../utils/memory-widget-manager';
import { Interfaces } from '../utils/memory-widget-utils';
import { VariableRange } from '../utils/memory-widget-variable-utils';
import { MemoryDiffWidget } from './memory-diff-table-widget';
import { nls } from '@theia/core/lib/common/nls';

export interface DiffMemory {
    beforeAddress: Long;
    beforeBytes: Interfaces.LabeledUint8Array;
    beforeVariables: VariableRange[];
    afterAddress: Long;
    afterBytes: Interfaces.LabeledUint8Array;
    afterVariables: VariableRange[];
}

@injectable()
export class MemoryDiffSelectWidget extends ReactWidget {
    static DIFF_SELECT_CLASS = 'memory-diff-select';

    protected beforeWidgetLabel = '';
    protected afterWidgetLabel = '';

    protected labelToWidgetMap = new Map<string, MemoryWidget>();

    @inject(MemoryWidgetManager) protected readonly memoryWidgetManager: MemoryWidgetManager;

    @postConstruct()
    protected init(): void {
        this.addClass(MemoryDiffSelectWidget.DIFF_SELECT_CLASS);
        this.id = MemoryDiffSelectWidget.DIFF_SELECT_CLASS;
        this.updateWidgetMap();
        this.update();
        this.toDispose.push(this.memoryWidgetManager.onChanged(() => this.updateWidgetMap()));
        this.scrollOptions = { ...this.scrollOptions, suppressScrollX: false };
        this.hide();
    }

    override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.querySelector('select')?.focus();
    }

    protected assignBaseValue = (e: React.ChangeEvent<HTMLSelectElement>): void => {
        this.beforeWidgetLabel = e.target.value;
        this.update();
    };

    protected assignLaterValue = (e: React.ChangeEvent<HTMLSelectElement>): void => {
        this.afterWidgetLabel = e.target.value;
        this.update();
    };

    render(): React.ReactNode {
        const optionLabels = [...this.labelToWidgetMap.keys()];
        const currentBase = this.getBeforeLabel(optionLabels);
        const currentChanged = this.getAfterLabel(optionLabels, currentBase);
        return optionLabels.length > 1 && (
            <div className='memory-diff-select-wrapper'>
                <div className='diff-select-input-wrapper'>
                    <div className='t-mv-diff-select-widget-options-wrapper'>
                        <MWSelect
                            id='diff-selector-before'
                            label='compare'
                            value={currentBase}
                            options={optionLabels}
                            onChange={this.assignBaseValue}
                        />
                    </div>
                    <div className='t-mv-diff-select-widget-options-wrapper'>
                        <MWSelect
                            id='diff-selector-after'
                            label='with'
                            value={currentChanged}
                            options={optionLabels.filter(label => label !== currentBase)}
                            onChange={this.assignLaterValue}
                            onKeyDown={this.diffIfEnter}
                        />
                    </div>
                </div>
                <button
                    type='button'
                    className='theia-button main memory-diff-select-go'
                    title={nls.localizeByDefault('Go')}
                    onClick={this.diff}
                >
                    {nls.localizeByDefault('Go')}
                </button>
            </div>
        );
    }

    protected diffIfEnter = (e: React.KeyboardEvent<HTMLInputElement>): void => {
        if (KeyCode.createKeyCode(e.nativeEvent).key?.keyCode === Key.ENTER.keyCode) {
            this.doDiff();
        }
    };

    protected updateWidgetMap(): void {
        const widgets = this.memoryWidgetManager.availableWidgets.filter(widget => !MemoryDiffWidget.is(widget) && !RegisterWidget.is(widget));
        this.labelToWidgetMap = new Map<string, MemoryWidget>(widgets.map((widget): [string, MemoryWidget] => [widget.title.label, widget]));
        this.update();
    }

    protected getBeforeLabel(optionLabels: string[] = [...this.labelToWidgetMap.keys()]): string {
        return this.labelToWidgetMap.has(this.beforeWidgetLabel) && this.beforeWidgetLabel || optionLabels[0];
    }

    protected getAfterLabel(optionLabels: string[], beforeWidgetLabel: string = this.getBeforeLabel(optionLabels)): string {
        return (this.afterWidgetLabel && this.afterWidgetLabel !== beforeWidgetLabel
            ? this.afterWidgetLabel
            : optionLabels.find(label => label !== beforeWidgetLabel)) ?? '';
    }

    protected diff = (): void => this.doDiff();

    protected doDiff(): void {
        const labels = [...this.labelToWidgetMap.keys()];
        const baseLabel = this.getBeforeLabel(labels);
        const changedLabel = this.getAfterLabel(labels, baseLabel);
        const baseWidget = this.labelToWidgetMap.get(baseLabel);
        const changedWidget = this.labelToWidgetMap.get(changedLabel);
        if (baseWidget && changedWidget) {
            const memoryAndAddresses = this.getMemoryArrays(baseWidget, changedWidget);
            this.memoryWidgetManager.doDiff({ ...memoryAndAddresses, titles: [baseLabel, changedLabel] });
        }
    }

    protected getMemoryArrays(beforeWidget: MemoryWidget, afterWidget: MemoryWidget): DiffMemory {
        const { memory: beforeMemory } = beforeWidget.optionsWidget;
        const { memory: afterMemory } = afterWidget.optionsWidget;
        return {
            beforeBytes: beforeMemory.bytes,
            afterBytes: afterMemory.bytes,
            beforeAddress: beforeMemory.address,
            afterAddress: afterMemory.address,
            beforeVariables: beforeMemory.variables,
            afterVariables: afterMemory.variables,
        };
    }
}
