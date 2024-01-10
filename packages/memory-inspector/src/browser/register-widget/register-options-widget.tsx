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

import { Disposable, DisposableCollection, Emitter, nls } from '@theia/core';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { DebugSession, DebugState } from '@theia/debug/lib/browser/debug-session';
import { ASCII_TOGGLE_ID, AUTO_UPDATE_TOGGLE_ID, MemoryOptionsWidget } from '../memory-widget/memory-options-widget';
import { MWInputWithSelect } from '../utils/memory-widget-components';
import { Constants, Interfaces, RegisterWidgetOptions } from '../utils/memory-widget-utils';
import { getRegisters, RegisterReadResult } from '../utils/memory-widget-variable-utils';
import { MWMultiSelect } from '../utils/multi-select-bar';
import { RegisterFilterService } from './register-filter-service';
import debounce = require('@theia/core/shared/lodash.debounce');

export const EMPTY_REGISTERS: RegisterReadResult = {
    threadId: undefined,
    registers: [],
};

export const REGISTER_FIELD_ID = 't-mv-register';
export const REGISTER_RADIX_ID = 't-mv-radix';
export const REGISTER_PRE_SETS_ID = 't-mv-pre-set';

export interface RegisterOptions extends Interfaces.MemoryOptions {
    reg: string;
    noRadixColumnDisplayed: boolean;
}

@injectable()
export class RegisterOptionsWidget extends MemoryOptionsWidget {
    override iconClass = 'register-view-icon';
    override lockIconClass = 'register-lock-icon';

    protected readonly LABEL_PREFIX = nls.localize('theia/memory-inspector/register', 'Register');

    protected readonly onRegisterChangedEmitter = new Emitter<[RegisterReadResult, boolean]>();
    readonly onRegisterChanged = this.onRegisterChangedEmitter.event;

    protected registerReadResult: RegisterReadResult = EMPTY_REGISTERS;

    protected reg: string;
    protected registerField: HTMLInputElement | undefined;
    protected registerDisplaySet = new Set();
    protected registerDisplayAll = true;
    protected registerFilterUpdate = false;
    protected registerReadError = nls.localize('theia/memory-inspector/register/readError', 'No Registers currently available.');
    protected showRegisterError = false;
    protected noRadixColumnDisplayed = this.noRadixDisplayed();
    protected override columnsDisplayed: Interfaces.ColumnsDisplayed = {
        register: {
            label: nls.localize('theia/memory-inspector/register', 'Register'),
            doRender: true
        },
        hexadecimal: {
            label: nls.localize('theia/memory-inspector/hexadecimal', 'Hexadecimal'),
            doRender: true
        },
        decimal: {
            label: nls.localize('theia/memory-inspector/decimal', 'Decimal'),
            doRender: false
        },
        octal: {
            label: nls.localize('theia/memory-inspector/octal', 'Octal'),
            doRender: false
        },
        binary: {
            label: nls.localize('theia/memory-inspector/binary', 'Binary'),
            doRender: false
        },
    };

    @inject(RegisterWidgetOptions) protected override readonly memoryWidgetOptions: RegisterWidgetOptions;
    @inject(RegisterFilterService) protected readonly filterService: RegisterFilterService;

    get registers(): RegisterReadResult {
        return {
            ...this.registerReadResult,
        };
    }

    override get options(): RegisterOptions {
        return this.storeState();
    }

    displayReg(element: string): boolean {
        return this.registerDisplayAll ||
            this.registerDisplaySet.has(element);
    }

    handleRadixRendering(regVal: string, radix: number, _regName?: string): string {
        // check if too big for integer
        const bInt = BigInt(regVal);
        return bInt.toString(radix);
    }

    @postConstruct()
    protected override init(): void {
        this.addClass(MemoryOptionsWidget.ID);
        this.addClass('reg-options-widget');

        this.title.label = `${this.LABEL_PREFIX} (${this.memoryWidgetOptions.identifier})`;
        this.title.caption = `${this.LABEL_PREFIX} (${this.memoryWidgetOptions.identifier})`;
        this.title.iconClass = this.iconClass;
        this.title.closable = true;

        if (this.memoryWidgetOptions.dynamic !== false) {
            this.toDispose.push(this.sessionManager.onDidChangeActiveDebugSession(({ current }) => {
                this.setUpListeners(current);
            }));

            this.toDispose.push(this.sessionManager.onDidCreateDebugSession(current => {
                this.setUpListeners(current);
            }));
            this.setUpListeners(this.sessionManager.currentSession);
        }
        this.toDispose.push(this.onOptionsChanged(() => this.update()));

        this.update();
    }

    setRegAndUpdate(regName: string): void {
        this.handleRegFromDebugWidgetSelection(regName);
    }

    protected override setUpListeners(session?: DebugSession): void {
        this.sessionListeners.dispose();
        this.sessionListeners = new DisposableCollection(Disposable.create(() => this.handleActiveSessionChange()));
        if (session) {
            this.sessionListeners.push(session.onDidChange(() => this.handleSessionChange()));
        }
    }

    protected override handleActiveSessionChange(): void {
        const isDynamic = this.memoryWidgetOptions.dynamic !== false;
        if (isDynamic && this.doUpdateAutomatically) {
            this.registerReadResult = EMPTY_REGISTERS;
            this.fireDidChangeRegister();
        }
    }

    protected override handleSessionChange(): void {
        const debugState = this.sessionManager.currentSession?.state;
        if (debugState === DebugState.Inactive) {
            this.registerReadResult = EMPTY_REGISTERS;
            this.fireDidChangeRegister();
        } else if (debugState === DebugState.Stopped) {
            const isReadyForQuery = !!this.sessionManager.currentSession?.currentFrame;
            const isDynamic = this.memoryWidgetOptions.dynamic !== false;
            if (isReadyForQuery && isDynamic && this.doUpdateAutomatically && this.registerReadResult !== EMPTY_REGISTERS) {
                this.updateRegisterView();
            }
        }
    }

    protected override acceptFocus(): void {
        if (this.doUpdateAutomatically) {
            if (this.registerField) {
                this.registerField.focus();
                this.registerField.select();
            }
        } else {
            const multiSelectBar = this.node.querySelector('.multi-select-bar') as HTMLDivElement;
            multiSelectBar?.focus();
        }
    }

    protected assignRegisterRef: React.LegacyRef<HTMLInputElement> = reg => {
        this.registerField = reg ?? undefined;
    };

    protected setRegFilterFromSelect = (e: React.ChangeEvent<HTMLSelectElement>): void => {
        if (this.registerField) {
            this.registerField.value = e.target.value;
        }
    };

    protected radixDisplayed(): boolean {
        const { register, ...radices } = this.columnsDisplayed;
        for (const val of Object.values(radices)) {
            if (val['doRender']) {
                return true;
            }
        }
        return false;
    }

    protected noRadixDisplayed(): boolean {
        return !this.radixDisplayed();
    }

    protected renderRegisterFieldGroup(): React.ReactNode {
        return (
            <>
                <div className='t-mv-group view-group'>
                    <MWInputWithSelect
                        id={REGISTER_FIELD_ID}
                        label={nls.localize('theia/memory-inspector/registers', 'Registers')}
                        placeholder={nls.localize('theia/memory-inspector/register-widget/filter-placeholder', 'Filter (starts with)')}
                        onSelectChange={this.setRegFilterFromSelect}
                        passRef={this.assignRegisterRef}
                        onKeyDown={this.doRefresh}
                        options={[...this.recentLocations.values]}
                        disabled={!this.doUpdateAutomatically}
                    />
                    <MWMultiSelect
                        id={ASCII_TOGGLE_ID}
                        label={nls.localize('theia/memory-inspector/columns', 'Columns')}
                        items={this.getOptionalColumns().map(column => ({ ...column, label: column.label.slice(0, 3) }))}
                        onSelectionChanged={this.handleColumnSelectionChange}
                    />
                    <button
                        type='button'
                        className='theia-button main view-group-go-button'
                        onClick={this.doRefresh}
                        disabled={!this.doUpdateAutomatically}
                    >
                        {nls.localizeByDefault('Go')}
                    </button>
                </div>
                <div className={`t-mv-memory-fetch-error${this.showRegisterError ? ' show' : ' hide'}`}>
                    {this.registerReadError}
                </div>
            </>
        );
    }

    protected override doHandleColumnSelectionChange(columnLabel: string, doShow: boolean): void {
        const trueColumnLabel = Object.keys(this.columnsDisplayed).find(key => key.startsWith(columnLabel));
        if (trueColumnLabel) {
            super.doHandleColumnSelectionChange(trueColumnLabel, doShow);
        }
    }

    protected override getObligatoryColumnIds(): string[] {
        return ['register'];
    }

    protected override renderInputContainer(): React.ReactNode {
        return (
            <div className='t-mv-settings-container'>
                <div className='t-mv-wrapper'>
                    {this.renderToolbar()}
                    {this.renderRegisterFieldGroup()}
                </div>
            </div>);
    }

    protected handleRegFromDebugWidgetSelection(regName: string): void {
        this.registerDisplaySet.clear();
        if (this.registerField) {
            this.registerField.value = regName;
            this.registerDisplayAll = false;
        }
        this.doUpdateRegisterView();
    }

    protected override renderToolbar(): React.ReactNode {
        return (
            <div className='memory-widget-toolbar'>
                {this.memoryWidgetOptions.dynamic !== false && (
                    <div className='memory-widget-auto-updates-container'>
                        <div
                            className={`fa fa-${this.doUpdateAutomatically ? 'unlock' : 'lock'}`}
                            id={AUTO_UPDATE_TOGGLE_ID}
                            title={this.doUpdateAutomatically ?
                                nls.localize('theia/memory-inspector/register/freeze', 'Freeze memory view') :
                                nls.localize('theia/memory-inspector/register/unfreeze', 'Unfreeze memory view')
                            }
                            onClick={this.toggleAutoUpdate}
                            onKeyDown={this.toggleAutoUpdate}
                            role='button'
                            tabIndex={0}
                        />
                    </div>
                )}
                {this.renderEditableTitleField()}
            </div>
        );
    }

    protected validateInputRegs(input: string): void {
        // identify sequences of alphanumeric characters
        const searchTexts = input.match(/\w+/g) ?? [];

        if (searchTexts.length !== 0) {
            this.registerDisplayAll = false;
            this.registerDisplaySet.clear();
            this.recentLocations.add(input);
            for (const { name } of this.registerReadResult.registers) {
                if (searchTexts.some(x => name.startsWith(x))) {
                    this.registerDisplaySet.add(name);
                }
            }
        } else {
            this.registerDisplayAll = true;
            this.registerDisplaySet.clear();
        }
    }

    protected updateRegisterView = debounce(this.doUpdateRegisterView.bind(this), Constants.DEBOUNCE_TIME, { trailing: true });

    protected async doUpdateRegisterView(): Promise<void> {
        try {
            if (!this.registerReadResult.registers || this.registerReadResult.threadId !== this.sessionManager.currentThread?.id) {
                this.registerReadResult = await this.getRegisters();
            }
            this.updateRegDisplayFilter();
            this.fireDidChangeRegister();
            this.doShowRegisterErrors(true);
        } catch (err) {
            this.registerReadError = nls.localize('theia/memory-inspector/registerReadError', 'There was an error fetching registers.');
            console.error('Failed to read registers', err);
            this.doShowRegisterErrors();
        } finally {
            this.registerFilterUpdate = false;
            this.update();
        }
    }

    protected updateRegDisplayFilter(): void {
        if (this.registerField) {
            if (this.registerField.value.length === 0) {
                this.registerDisplayAll = true;
            } else {
                this.validateInputRegs(this.registerField.value);
            }
        }
    }

    protected override doRefresh = (event: React.KeyboardEvent<HTMLInputElement> | React.MouseEvent<HTMLButtonElement, MouseEvent>): void => {
        if ('key' in event && event.key !== 'Enter') {
            return;
        }
        this.registerFilterUpdate = true;
        this.updateRegisterView();
    };

    protected async getRegisters(): Promise<RegisterReadResult> {
        const regResult = await getRegisters(this.sessionManager.currentSession);
        const threadResult = this.sessionManager.currentSession?.currentThread?.id;
        return { threadId: threadResult, registers: regResult };
    }

    protected fireDidChangeRegister(): void {
        this.onRegisterChangedEmitter.fire([this.registerReadResult, this.registerFilterUpdate]);
    }

    override storeState(): RegisterOptions {
        return {
            ...super.storeState(),
            reg: this.registerField?.value ?? this.reg,
            noRadixColumnDisplayed: this.noRadixDisplayed(),
        };
    }

    override restoreState(oldState: RegisterOptions): void {
        this.reg = oldState.reg ?? this.reg;
        this.noRadixColumnDisplayed = oldState.noRadixColumnDisplayed;
    }

    protected doShowRegisterErrors = (doClearError = false): void => {
        if (this.errorTimeout !== undefined) {
            clearTimeout(this.errorTimeout);
        }
        if (doClearError) {
            this.showRegisterError = false;
            this.update();
            this.errorTimeout = undefined;
            return;
        }
        this.showRegisterError = true;
        this.update();
        this.errorTimeout = setTimeout(() => {
            this.showRegisterError = false;
            this.update();
            this.errorTimeout = undefined;
        }, Constants.ERROR_TIMEOUT);
    };
}
