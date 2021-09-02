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

import * as React from '@theia/core/shared/react';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ThemeType } from '@theia/core/lib/browser/theming';
import { Key, KeyCode } from '@theia/core/lib/browser';
import { Interfaces, MemoryDiffWidgetData, Utils } from '../utils/memory-widget-utils';
import { MWInput } from '../utils/memory-widget-components';
import { DiffLabels } from './memory-diff-widget-types';
import { MemoryOptionsWidget, LOCATION_OFFSET_FIELD_ID, LENGTH_FIELD_ID } from '../memory-widget/memory-options-widget';

export interface DiffMemoryOptions extends Interfaces.MemoryOptions {
    beforeOffset: number;
    afterOffset: number;
}

@injectable()
export class MemoryDiffOptionsWidget extends MemoryOptionsWidget {
    @inject(MemoryDiffWidgetData) protected memoryWidgetOptions: MemoryDiffWidgetData;

    protected themeType: ThemeType;

    get options(): DiffMemoryOptions {
        return this.storeState();
    }

    updateDiffData(newDiffData: Partial<MemoryDiffWidgetData>): void {
        this.memoryWidgetOptions = { ...this.memoryWidgetOptions, ...newDiffData };
        this.init();
    }

    @postConstruct()
    protected init(): void {
        this.addClass(MemoryOptionsWidget.ID);
        this.addClass('diff-options-widget');
        const { identifier, beforeBytes, afterBytes } = this.memoryWidgetOptions;
        this.id = `${MemoryDiffOptionsWidget.ID}-${identifier}`;
        this.title.label = `Diff: ${identifier}`;
        this.title.caption = this.title.label;
        this.title.iconClass = this.iconClass;
        this.title.closable = true;

        this.toDispose.push(this.onOptionsChanged(() => this.update()));

        beforeBytes.label = DiffLabels.Before;
        afterBytes.label = DiffLabels.After;

        this.columnsDisplayed = {
            beforeAddress: { label: 'Address', doRender: true },
            beforeData: { label: this.memoryWidgetOptions.titles[0], doRender: true },
            afterAddress: { label: 'Address', doRender: true },
            afterData: { label: this.memoryWidgetOptions.titles[1], doRender: true },
            variables: { label: 'Variables', doRender: false },
            ascii: { label: 'ASCII', doRender: false },
        };

        this.update();
    }

    protected acceptFocus(): void {
        const settingsCog = this.node.querySelector('.toggle-settings-click-zone') as HTMLDivElement;
        settingsCog?.focus();
    }

    protected renderMemoryLocationGroup(): React.ReactNode {
        const { titles: [beforeTitle, afterTitle] } = this.memoryWidgetOptions;
        return (
            <div className='t-mv-group view-group'>
                <MWInput
                    id={LOCATION_OFFSET_FIELD_ID}
                    label={`${beforeTitle} Offset`}
                    title={`Bytes to offset the memory from ${beforeTitle}`}
                    defaultValue='0'
                    passRef={this.assignOffsetRef}
                    onChange={Utils.validateNumericalInputs}
                    onKeyDown={this.doRefresh}
                />
                <MWInput
                    id={LENGTH_FIELD_ID}
                    label={`${afterTitle} Offset`}
                    title={`Bytes to offset the memory from ${afterTitle}`}
                    defaultValue='0'
                    passRef={this.assignReadLengthRef}
                    onChange={Utils.validateNumericalInputs}
                    onKeyDown={this.doRefresh}
                />
                <button
                    type='button'
                    className='theia-button main view-group-go-button'
                    onClick={this.doRefresh}
                >
                    Go
                </button>
            </div>
        );
    }

    protected getObligatoryColumnIds(): string[] {
        return ['beforeAddress', 'beforeData', 'afterAddress', 'afterData'];
    }

    protected doRefresh = (event: React.KeyboardEvent<HTMLInputElement> | React.MouseEvent<HTMLButtonElement, MouseEvent>): void => {
        if ('key' in event && KeyCode.createKeyCode(event.nativeEvent).key?.keyCode !== Key.ENTER.keyCode) {
            return;
        }
        this.fireDidChangeOptions();
    };

    storeState(): DiffMemoryOptions {
        return {
            ...super.storeState(),
            // prefix a 0. It'll do nothing if it's a number, but if it's an empty string or garbage, it'll make parseInt return 0.
            beforeOffset: parseInt(`0${this.offsetField?.value ?? 0}`),
            afterOffset: parseInt(`0${this.readLengthField?.value ?? 0}`),
        };
    }
}
