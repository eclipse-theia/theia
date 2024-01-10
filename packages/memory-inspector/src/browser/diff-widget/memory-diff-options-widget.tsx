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
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { ThemeType } from '@theia/core/lib/common/theme';
import { LENGTH_FIELD_ID, LOCATION_OFFSET_FIELD_ID, MemoryOptionsWidget } from '../memory-widget/memory-options-widget';
import { MWInput } from '../utils/memory-widget-components';
import { Interfaces, MemoryDiffWidgetData, Utils } from '../utils/memory-widget-utils';
import { DiffLabels } from './memory-diff-widget-types';
import { nls } from '@theia/core/lib/common/nls';

export interface DiffMemoryOptions extends Interfaces.MemoryOptions {
    beforeOffset: number;
    afterOffset: number;
}

@injectable()
export class MemoryDiffOptionsWidget extends MemoryOptionsWidget {
    @inject(MemoryDiffWidgetData) protected override memoryWidgetOptions: MemoryDiffWidgetData;

    protected themeType: ThemeType;

    override get options(): DiffMemoryOptions {
        return this.storeState();
    }

    updateDiffData(newDiffData: Partial<MemoryDiffWidgetData>): void {
        this.memoryWidgetOptions = { ...this.memoryWidgetOptions, ...newDiffData };
        this.init();
    }

    @postConstruct()
    protected override init(): void {
        this.addClass(MemoryOptionsWidget.ID);
        this.addClass('diff-options-widget');
        const { identifier, beforeBytes, afterBytes } = this.memoryWidgetOptions;

        this.id = `${MemoryDiffOptionsWidget.ID}-${identifier}`;
        this.title.label = nls.localize('theia/memory-inspector/diff/label', 'Diff: {0}', identifier);
        this.title.caption = this.title.label;
        this.title.iconClass = this.iconClass;
        this.title.closable = true;

        this.toDispose.push(this.onOptionsChanged(() => this.update()));

        beforeBytes.label = DiffLabels.Before;
        afterBytes.label = DiffLabels.After;

        this.columnsDisplayed = {
            beforeAddress: {
                label: nls.localizeByDefault('Address'),
                doRender: true
            },
            beforeData: {
                label: this.memoryWidgetOptions.titles[0],
                doRender: true
            },
            afterAddress: {
                label: nls.localizeByDefault('Address'),
                doRender: true
            },
            afterData: {
                label: this.memoryWidgetOptions.titles[1],
                doRender: true
            },
            variables: {
                label: nls.localizeByDefault('Variables'),
                doRender: false
            },
            ascii: {
                label: nls.localize('theia/memory-inspector/ascii', 'ASCII'),
                doRender: false
            },
        };

        this.update();
    }

    protected override acceptFocus(): void {
        const settingsCog = this.node.querySelector('.toggle-settings-click-zone') as HTMLDivElement;
        settingsCog?.focus();
    }

    protected override renderMemoryLocationGroup(): React.ReactNode {
        const { titles: [beforeTitle, afterTitle] } = this.memoryWidgetOptions;
        return (
            <div className='t-mv-group view-group'>
                <MWInput
                    id={LOCATION_OFFSET_FIELD_ID}
                    label={nls.localize('theia/memory-inspector/diff-widget/offset-label', '{0} Offset', beforeTitle)}
                    title={nls.localize('theia/memory-inspector/diff-widget/offset-title', 'Bytes to offset the memory from {0}', beforeTitle)}
                    defaultValue='0'
                    passRef={this.assignOffsetRef}
                    onChange={Utils.validateNumericalInputs}
                    onKeyDown={this.doRefresh}
                />
                <MWInput
                    id={LENGTH_FIELD_ID}
                    label={nls.localize('theia/memory-inspector/diff-widget/offset-label', '{0} Offset', afterTitle)}
                    title={nls.localize('theia/memory-inspector/diff-widget/offset-title', 'Bytes to offset the memory from {0}', afterTitle)}
                    defaultValue='0'
                    passRef={this.assignReadLengthRef}
                    onChange={Utils.validateNumericalInputs}
                    onKeyDown={this.doRefresh}
                />
                <button
                    type='button'
                    className='theia-button main view-group-go-button'
                    title={nls.localizeByDefault('Go')}
                    onClick={this.doRefresh}
                >
                    {nls.localizeByDefault('Go')}
                </button>
            </div>
        );
    }

    protected override getObligatoryColumnIds(): string[] {
        return ['beforeAddress', 'beforeData', 'afterAddress', 'afterData'];
    }

    protected override doRefresh = (event: React.KeyboardEvent<HTMLInputElement> | React.MouseEvent<HTMLButtonElement, MouseEvent>): void => {
        if ('key' in event && KeyCode.createKeyCode(event.nativeEvent).key?.keyCode !== Key.ENTER.keyCode) {
            return;
        }
        this.fireDidChangeOptions();
    };

    override storeState(): DiffMemoryOptions {
        return {
            ...super.storeState(),
            // prefix a 0. It'll do nothing if it's a number, but if it's an empty string or garbage, it'll make parseInt return 0.
            beforeOffset: parseInt(`0${this.offsetField?.value ?? 0}`),
            afterOffset: parseInt(`0${this.readLengthField?.value ?? 0}`),
        };
    }
}
