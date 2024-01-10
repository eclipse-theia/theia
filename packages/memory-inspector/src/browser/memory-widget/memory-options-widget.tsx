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

import { deepFreeze, Disposable, DisposableCollection, Emitter, nls } from '@theia/core';
import { Key, KeyCode, Message, ReactWidget, StatefulWidget } from '@theia/core/lib/browser';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { DebugSession, DebugState } from '@theia/debug/lib/browser/debug-session';
import { DebugSessionManager } from '@theia/debug/lib/browser/debug-session-manager';
import * as Long from 'long';
import { MemoryProviderService } from '../memory-provider/memory-provider-service';
import { Recents } from '../utils/memory-recents';
import { MWInput, MWInputWithSelect, MWSelect } from '../utils/memory-widget-components';
import { Constants, Interfaces, MemoryWidgetOptions, Utils } from '../utils/memory-widget-utils';
import { VariableRange } from '../utils/memory-widget-variable-utils';
import { MWMultiSelect, SingleSelectItemProps } from '../utils/multi-select-bar';
import debounce = require('@theia/core/shared/lodash.debounce');

export const EMPTY_MEMORY: Interfaces.MemoryReadResult = deepFreeze({
    bytes: new Uint8Array(),
    address: new Long(0, 0, true),
});

export const LOCATION_FIELD_ID = 't-mv-location';
export const LENGTH_FIELD_ID = 't-mv-length';
export const LOCATION_OFFSET_FIELD_ID = 't-mv-location-offset';
export const BYTES_PER_ROW_FIELD_ID = 't-mv-bytesrow';
export const BYTES_PER_GROUP_FIELD_ID = 't-mv-bytesgroup';
export const ENDIAN_SELECT_ID = 't-mv-endiannesss';
export const ASCII_TOGGLE_ID = 't-mv-ascii-toggle';
export const AUTO_UPDATE_TOGGLE_ID = 't-mv-auto-update-toggle';

@injectable()
export class MemoryOptionsWidget extends ReactWidget implements StatefulWidget {
    static ID = 'memory-view-options-widget';
    static LABEL = nls.localize('theia/memory-inspector/memoryTitle', 'Memory');
    iconClass = 'memory-view-icon';
    lockIconClass = 'memory-lock-icon';

    static WIDGET_H2_CLASS = 'memory-widget-header';
    static WIDGET_HEADER_INPUT_CLASS = 'memory-widget-header-input';

    protected additionalColumnSelectLabel = nls.localize('theia/memory-inspector/extraColumn', 'Extra Column');

    protected sessionListeners = new DisposableCollection();

    protected readonly onOptionsChangedEmitter = new Emitter<string | undefined>();
    readonly onOptionsChanged = this.onOptionsChangedEmitter.event;
    protected readonly onMemoryChangedEmitter = new Emitter<Interfaces.MemoryReadResult>();
    readonly onMemoryChanged = this.onMemoryChangedEmitter.event;
    protected pinnedMemoryReadResult: Deferred<Interfaces.MemoryReadResult | false> | undefined;

    protected memoryReadResult: Interfaces.MemoryReadResult = EMPTY_MEMORY;
    protected columnsDisplayed: Interfaces.ColumnsDisplayed = {
        address: {
            label: nls.localizeByDefault('Address'),
            doRender: true
        },
        data: {
            label: nls.localize('theia/memory-inspector/data', 'Data'),
            doRender: true
        },
        variables: {
            label: nls.localizeByDefault('Variables'),
            doRender: true
        },
        ascii: {
            label: nls.localize('theia/memory-inspector/ascii', 'ASCII'),
            doRender: false
        },
    };

    protected byteSize = 8;

    protected bytesPerGroup = 1;
    protected groupsPerRow = 4;
    protected variables: VariableRange[] = [];
    protected endianness: Interfaces.Endianness = Interfaces.Endianness.Little;

    protected memoryReadError = nls.localize('theia/memory-inspector/memory/readError/noContents', 'No memory contents currently available.');

    protected address: string | number = 0;
    protected offset = 0;
    protected readLength = 256;
    protected doDisplaySettings = false;
    protected doUpdateAutomatically = true;
    protected showMemoryError = false;
    protected errorTimeout: NodeJS.Timeout | undefined = undefined;
    protected addressField: HTMLInputElement | undefined;
    protected offsetField: HTMLInputElement | undefined;
    protected readLengthField: HTMLInputElement | undefined;
    protected headerInputField: HTMLInputElement | undefined;
    protected recentLocations = new Recents();
    protected showTitleEditIcon = false;
    protected isTitleEditable = false;

    @inject(MemoryProviderService) protected readonly memoryProvider: MemoryProviderService;
    @inject(DebugSessionManager) protected readonly sessionManager: DebugSessionManager;
    @inject(MemoryWidgetOptions) protected readonly memoryWidgetOptions: MemoryWidgetOptions;

    get memory(): Interfaces.WidgetMemoryState {
        return {
            ...this.memoryReadResult,
            variables: this.variables,
        };
    }

    get options(): Interfaces.MemoryOptions {
        return this.storeState();
    }

    @postConstruct()
    protected init(): void {
        this.addClass(MemoryOptionsWidget.ID);

        this.title.label = nls.localize('theia/memory-inspector/memory', 'Memory ({0})', this.memoryWidgetOptions.displayId);
        this.title.caption = nls.localize('theia/memory-inspector/memory', 'Memory ({0})', this.memoryWidgetOptions.displayId);
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

    async setAddressAndGo(
        newAddress: string,
        newOffset?: number,
        newLength?: number,
        direction?: 'above' | 'below',
    ): Promise<Interfaces.MemoryReadResult | false | undefined> {
        let doUpdate = false;
        const originalValues = {
            offset: '',
            length: '',
        };
        if (this.addressField) {
            this.addressField.value = newAddress;
            doUpdate = true;
        }
        if (this.offsetField && newOffset !== undefined) {
            originalValues.offset = this.offsetField.value;
            this.offsetField.value = newOffset.toString();
            doUpdate = true;
        }
        if (this.readLengthField && newLength !== undefined) {
            originalValues.length = this.readLengthField.value;
            this.readLengthField.value = newLength.toString();
            doUpdate = true;
        }
        if (doUpdate && this.readLengthField && this.offsetField) {
            this.pinnedMemoryReadResult = new Deferred<Interfaces.MemoryReadResult>();
            this.updateMemoryView();
            const result = await this.pinnedMemoryReadResult.promise;
            if (result === false) {
                // Memory request errored
                this.readLengthField.value = originalValues.length;
                this.offsetField.value = originalValues.offset;
            }
            if (result) {
                // Memory request returned some memory
                const resultLength = result.bytes.length * 8 / this.byteSize;
                const lengthFieldValue = parseInt(this.readLengthField.value);
                if (lengthFieldValue !== resultLength) {
                    this.memoryReadError = nls.localize('theia/memory-inspector/memory/readError/bounds', 'Memory bounds exceeded, result will be truncated.');
                    this.doShowMemoryErrors();
                    this.readLengthField.value = resultLength.toString();
                    if (direction === 'above') {
                        this.offsetField.value = `${parseInt(originalValues.offset) - (resultLength - parseInt(originalValues.length))}`;
                    }
                    this.update();
                }
            }
        }
        return undefined;
    }

    protected setUpListeners(session?: DebugSession): void {
        this.sessionListeners.dispose();
        this.sessionListeners = new DisposableCollection(Disposable.create(() => this.handleActiveSessionChange()));
        if (session) {
            this.sessionListeners.push(session.onDidChange(() => this.handleSessionChange()));
        }
    }

    protected handleActiveSessionChange(): void {
        const isDynamic = this.memoryWidgetOptions.dynamic !== false;
        if (isDynamic && this.doUpdateAutomatically) {
            this.memoryReadResult = EMPTY_MEMORY;
            this.fireDidChangeMemory();
        }
    }

    protected handleSessionChange(): void {
        const isStopped = this.sessionManager.currentSession?.state === DebugState.Stopped;
        const isReadyForQuery = !!this.sessionManager.currentSession?.currentFrame;
        const isDynamic = this.memoryWidgetOptions.dynamic !== false;
        if (isStopped && isReadyForQuery && isDynamic && this.doUpdateAutomatically && this.memoryReadResult !== EMPTY_MEMORY) {
            this.updateMemoryView();
        }
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.acceptFocus();
    }

    protected acceptFocus(): void {
        if (this.doUpdateAutomatically) {
            if (this.addressField) {
                this.addressField.focus();
                this.addressField.select();
            }
        } else {
            const settingsCog = this.node.querySelector('.toggle-settings-click-zone') as HTMLDivElement;
            settingsCog?.focus();
        }
    }

    protected handleColumnSelectionChange = (columnLabel: string, doShow: boolean): void => this.doHandleColumnSelectionChange(columnLabel, doShow);

    protected doHandleColumnSelectionChange(columnLabel: string, doShow: boolean): void {
        if (columnLabel in this.columnsDisplayed) {
            this.columnsDisplayed[columnLabel].doRender = doShow;
            this.fireDidChangeOptions(ASCII_TOGGLE_ID);
        }
    }

    protected toggleAutoUpdate = (e: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>): void => {
        if (e.nativeEvent.type === 'click') {
            e.currentTarget.blur();
        }
        if ('key' in e && KeyCode.createKeyCode(e.nativeEvent).key?.keyCode === Key.TAB.keyCode) {
            return;
        }
        this.doUpdateAutomatically = !this.doUpdateAutomatically;
        if (this.doUpdateAutomatically) {
            this.title.iconClass = this.iconClass;
        } else {
            this.title.iconClass = this.lockIconClass;
        }
        this.fireDidChangeOptions();
    };

    protected onByteSizeChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
        this.byteSize = parseInt(event.target.value);
        this.fireDidChangeOptions(event.target.id);
    };

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        if (this.memoryWidgetOptions.dynamic !== false) {
            if (this.addressField) {
                this.addressField.value = this.address.toString();
            }
        }
    }

    protected toggleDoShowSettings = (e: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>): void => {
        if (!('key' in e) || KeyCode.createKeyCode(e.nativeEvent).key?.keyCode === Key.TAB.keyCode) {
            this.doDisplaySettings = !this.doDisplaySettings;
            this.update();
        }
    };

    protected render(): React.ReactNode {
        return (
            <div className='t-mv-container'>
                {this.renderInputContainer()}
            </div>
        );
    }

    protected renderInputContainer(): React.ReactNode {
        return (
            <div className='t-mv-settings-container'>
                <div className='t-mv-wrapper'>
                    {this.renderToolbar()}
                    {this.renderMemoryLocationGroup()}
                    {this.doDisplaySettings && (
                        <div className='t-mv-toggle-settings-wrapper'>
                            {this.renderByteDisplayGroup()}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    protected renderByteDisplayGroup(): React.ReactNode {
        return (
            <div className='t-mv-group settings-group'>
                <MWSelect
                    id='byte-size-select'
                    label={nls.localize('theia/memory-inspector/byteSize', 'Byte Size')}
                    value={this.byteSize.toString()}
                    onChange={this.onByteSizeChange}
                    options={['8', '16', '32', '64']}
                />
                <MWSelect
                    id={BYTES_PER_GROUP_FIELD_ID}
                    label={nls.localize('theia/memory-inspector/bytesPerGroup', 'Bytes Per Group')}
                    value={this.bytesPerGroup.toString()}
                    onChange={this.onBytesPerGroupChange}
                    options={['1', '2', '4', '8', '16']}
                />
                <MWSelect
                    id={BYTES_PER_ROW_FIELD_ID}
                    label={nls.localize('theia/memory-inspector/groupsPerRow', 'Groups Per Row')}
                    value={this.groupsPerRow.toString()}
                    onChange={this.onGroupsPerRowChange}
                    options={['1', '2', '4', '8', '16', '32']}
                />
                <MWSelect
                    id={ENDIAN_SELECT_ID}
                    label={nls.localize('theia/memory-inspector/endianness', 'Endianness')}
                    value={this.endianness}
                    onChange={this.onEndiannessChange}
                    options={[Interfaces.Endianness.Little, Interfaces.Endianness.Big]}
                />
                <MWMultiSelect
                    id={ASCII_TOGGLE_ID}
                    label={nls.localize('theia/memory-inspector/columns', 'Columns')}
                    items={this.getOptionalColumns()}
                    onSelectionChanged={this.handleColumnSelectionChange}
                />
            </div>
        );
    }

    protected getObligatoryColumnIds(): string[] {
        return ['address', 'data'];
    }

    protected getOptionalColumns(): SingleSelectItemProps[] {
        const obligatoryColumns = new Set(this.getObligatoryColumnIds());
        return Object.entries(this.columnsDisplayed)
            .reduce<SingleSelectItemProps[]>((accumulated, [id, { doRender, label }]) => {
                if (!obligatoryColumns.has(id)) {
                    accumulated.push({ id, label, defaultChecked: doRender });
                }
                return accumulated;
            }, []);
    }

    protected assignLocationRef: React.LegacyRef<HTMLInputElement> = location => {
        this.addressField = location ?? undefined;
    };

    protected assignReadLengthRef: React.LegacyRef<HTMLInputElement> = readLength => {
        this.readLengthField = readLength ?? undefined;
    };

    protected assignOffsetRef: React.LegacyRef<HTMLInputElement> = offset => {
        this.offsetField = offset ?? undefined;
    };

    protected setAddressFromSelect = (e: React.ChangeEvent<HTMLSelectElement>): void => {
        if (this.addressField) {
            this.addressField.value = e.target.value;
        }
    };

    protected renderMemoryLocationGroup(): React.ReactNode {
        return (
            <>
                <div className='t-mv-group view-group'>
                    <MWInputWithSelect
                        id={LOCATION_FIELD_ID}
                        label={nls.localizeByDefault('Address')}
                        title={nls.localize('theia/memory-inspector/addressTooltip', 'Memory location to display, an address or expression evaluating to an address')}
                        defaultValue={`${this.address}`}
                        onSelectChange={this.setAddressFromSelect}
                        passRef={this.assignLocationRef}
                        onKeyDown={this.doRefresh}
                        options={[...this.recentLocations.values]}
                        disabled={!this.doUpdateAutomatically}
                    />
                    <MWInput
                        id={LOCATION_OFFSET_FIELD_ID}
                        label={nls.localize('theia/memory-inspector/offset', 'Offset')}
                        title={nls.localize('theia/memory-inspector/offsetTooltip', 'Offset to be added to the current memory location, when navigating')}
                        defaultValue='0'
                        passRef={this.assignOffsetRef}
                        onKeyDown={this.doRefresh}
                        disabled={!this.doUpdateAutomatically}
                    />
                    <MWInput
                        id={LENGTH_FIELD_ID}
                        label={nls.localize('theia/memory-inspector/length', 'Length')}
                        title={nls.localize('theia/memory-inspector/lengthTooltip', 'Number of bytes to fetch, in decimal or hexadecimal')}
                        defaultValue={this.readLength.toString()}
                        passRef={this.assignReadLengthRef}
                        onChange={Utils.validateNumericalInputs}
                        onKeyDown={this.doRefresh}
                        disabled={!this.doUpdateAutomatically}
                    />
                    <button
                        type='button'
                        className='theia-button main view-group-go-button'
                        onClick={this.doRefresh}
                        disabled={!this.doUpdateAutomatically}
                        title={nls.localizeByDefault('Go')}
                    >
                        {nls.localizeByDefault('Go')}
                    </button>
                </div>
                <div className={`t-mv-memory-fetch-error${this.showMemoryError ? ' show' : ' hide'}`}>
                    {this.memoryReadError}
                </div>
            </>
        );
    }

    protected activateHeaderInputField = (e: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>): void => {
        if (!this.isTitleEditable) {
            const isMouseDown = !('key' in e);
            const isActivationKey = 'key' in e && (
                KeyCode.createKeyCode(e.nativeEvent).key?.keyCode === Key.SPACE.keyCode
                || KeyCode.createKeyCode(e.nativeEvent).key?.keyCode === Key.ENTER.keyCode
            );
            if (isMouseDown || isActivationKey) {
                if (isMouseDown) {
                    e.currentTarget.blur();
                }
                this.isTitleEditable = true;
                this.update();
            }
        }
    };

    protected saveHeaderInputValue = (e: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>): void => {
        const isMouseDown = !('key' in e);
        const isSaveKey = 'key' in e && e.key === 'Enter';
        const isCancelKey = 'key' in e && e.key === 'Escape';
        e.stopPropagation();
        if (isMouseDown || isSaveKey || isCancelKey) {
            this.updateHeader(isCancelKey);
        }
    };

    protected assignHeaderInputRef = (element: HTMLInputElement): void => {
        if (element) {
            this.headerInputField = element;
            element.focus();
        }
    };

    protected updateHeader(isCancelKey: boolean): void {
        if (!isCancelKey && this.headerInputField) {
            this.title.label = this.headerInputField.value;
            this.title.caption = this.headerInputField.value;
        }

        this.isTitleEditable = false;
        this.update();
    }

    protected renderToolbar(): React.ReactNode {
        return (
            <div className='memory-widget-toolbar'>
                {this.renderLockIcon()}
                {this.renderEditableTitleField()}
                {this.renderSettingsContainer()}
            </div>
        );
    }

    protected renderSettingsContainer(): React.ReactNode {
        return <div className='toggle-settings-container'>
            <div
                className='toggle-settings-click-zone no-select'
                tabIndex={0}
                aria-label={this.doDisplaySettings ?
                    nls.localize('theia/memory-inspector/memory/hideSettings', 'Hide Settings Panel') :
                    nls.localize('theia/memory-inspector/memory/showSettings', 'Show Settings Panel')}
                role='button'
                onClick={this.toggleDoShowSettings}
                onKeyDown={this.toggleDoShowSettings}
                title={this.doDisplaySettings ?
                    nls.localize('theia/memory-inspector/memory/hideSettings', 'Hide Settings Panel') :
                    nls.localize('theia/memory-inspector/memory/showSettings', 'Show Settings Panel')}>
                <i className='codicon codicon-settings-gear' />
                <span>{this.doDisplaySettings ?
                    nls.localize('theia/memory-inspector/closeSettings', 'Close Settings') :
                    nls.localizeByDefault('Settings')}
                </span>
            </div>
        </div>;
    }

    protected renderLockIcon(): React.ReactNode {
        return this.memoryWidgetOptions.dynamic !== false && (
            <div className='memory-widget-auto-updates-container'>
                <div
                    className={`fa fa-${this.doUpdateAutomatically ? 'unlock' : 'lock'}`}
                    id={AUTO_UPDATE_TOGGLE_ID}
                    title={this.doUpdateAutomatically ?
                        nls.localize('theia/memory-inspector/memory/freeze', 'Freeze Memory View') :
                        nls.localize('theia/memory-inspector/memory/unfreeze', 'Unfreeze Memory View')}
                    onClick={this.toggleAutoUpdate}
                    onKeyDown={this.toggleAutoUpdate}
                    role='button'
                    tabIndex={0} />
            </div>
        );
    }

    protected renderEditableTitleField(): React.ReactNode {
        return (
            <div
                className='memory-widget-header-click-zone'
                tabIndex={0}
                onClick={this.activateHeaderInputField}
                onKeyDown={this.activateHeaderInputField}
                role='button'
            >
                {!this.isTitleEditable
                    ? (
                        <h2 className={`${MemoryOptionsWidget.WIDGET_H2_CLASS}${!this.doUpdateAutomatically ? ' disabled' : ''} no-select`}>
                            {this.title.label}
                        </h2>
                    )
                    : <input
                        className='theia-input'
                        type='text'
                        defaultValue={this.title.label}
                        onKeyDown={this.saveHeaderInputValue}
                        spellCheck={false}
                        ref={this.assignHeaderInputRef}
                    />}
                {!this.isTitleEditable && (
                    <div className={`fa fa-pencil${this.showTitleEditIcon ? ' show' : ' hide'}`} />
                )}
                {this.isTitleEditable && (
                    <div
                        className='fa fa-save'
                        onClick={this.saveHeaderInputValue}
                        onKeyDown={this.saveHeaderInputValue}
                        role='button'
                        tabIndex={0}
                        title={nls.localizeByDefault('Save')}
                    />
                )}
            </div>
        );
    }

    storeState(): Interfaces.MemoryOptions {
        return {
            address: this.addressField?.value ?? this.address,
            offset: parseInt(`${this.offsetField?.value}`) ?? this.offset,
            length: parseInt(`${this.readLengthField?.value}`) ?? this.readLength,
            byteSize: this.byteSize,
            bytesPerGroup: this.bytesPerGroup,
            groupsPerRow: this.groupsPerRow,
            endianness: this.endianness,
            doDisplaySettings: this.doDisplaySettings,
            columnsDisplayed: this.columnsDisplayed,
            recentLocationsArray: this.recentLocations.values,
            isFrozen: !this.doUpdateAutomatically,
            doUpdateAutomatically: this.doUpdateAutomatically,
        };
    }

    restoreState(oldState: Interfaces.MemoryOptions): void {
        this.address = oldState.address ?? this.address;
        this.offset = oldState.offset ?? this.offset;
        this.readLength = oldState.length ?? this.readLength;
        this.byteSize = oldState.byteSize ?? this.byteSize;
        this.bytesPerGroup = oldState.bytesPerGroup ?? this.bytesPerGroup;
        this.groupsPerRow = oldState.groupsPerRow ?? this.groupsPerRow;
        this.endianness = oldState.endianness ?? this.endianness;
        this.recentLocations = new Recents(oldState.recentLocationsArray) ?? this.recentLocations;
        this.doDisplaySettings = !!oldState.doDisplaySettings;
        if (oldState.columnsDisplayed) {
            this.columnsDisplayed = oldState.columnsDisplayed;
        }
    }

    protected doShowMemoryErrors = (doClearError = false): void => {
        if (this.errorTimeout !== undefined) {
            clearTimeout(this.errorTimeout);
        }
        if (doClearError) {
            this.showMemoryError = false;
            this.update();
            this.errorTimeout = undefined;
            return;
        }
        this.showMemoryError = true;
        this.update();
        this.errorTimeout = setTimeout(() => {
            this.showMemoryError = false;
            this.update();
            this.errorTimeout = undefined;
        }, Constants.ERROR_TIMEOUT);
    };

    fetchNewMemory(): void {
        this.updateMemoryView();
    }

    protected doRefresh = (event: React.KeyboardEvent<HTMLInputElement> | React.MouseEvent<HTMLButtonElement, MouseEvent>): void => {
        if ('key' in event && event.key !== 'Enter') {
            return;
        }
        this.updateMemoryView();
    };

    protected updateMemoryView = debounce(this.doUpdateMemoryView.bind(this), Constants.DEBOUNCE_TIME, { trailing: true });

    protected async doUpdateMemoryView(): Promise<void> {
        if (!(this.addressField && this.readLengthField)) { return; }

        if (this.addressField?.value.trim().length === 0) {
            this.memoryReadError = nls.localize('theia/memory-inspector/memory/addressField/memoryReadError', 'Enter an address or expression in the Location field.');
            this.doShowMemoryErrors();
            return;
        }
        if (this.readLengthField.value.trim().length === 0) {
            this.memoryReadError = nls.localize('theia/memory-inspector/memory/readLength/memoryReadError', 'Enter a length (decimal or hexadecimal number) in the Length field.');
            this.doShowMemoryErrors();
            return;
        }

        const startAddress = this.addressField.value;
        const locationOffset = parseInt(`${this.offsetField?.value}`) || 0;
        const readLength = parseInt(this.readLengthField.value);

        try {
            this.memoryReadResult = await this.getMemory(startAddress, readLength, locationOffset);
            this.fireDidChangeMemory();
            if (this.pinnedMemoryReadResult) {
                this.pinnedMemoryReadResult.resolve(this.memoryReadResult);
            }
            this.doShowMemoryErrors(true);
        } catch (err) {
            this.memoryReadError = this.getUserError(err);
            console.error('Failed to read memory', err);
            this.doShowMemoryErrors();
            if (this.pinnedMemoryReadResult) {
                this.pinnedMemoryReadResult.resolve(this.memoryReadResult);
            }
        } finally {
            this.pinnedMemoryReadResult = undefined;
            this.update();
        }
    }

    protected getUserError(err: unknown): string {
        return err instanceof Error ? err.message : nls.localize('theia/memory-inspector/memory/userError', 'There was an error fetching memory.');
    }

    protected async getMemory(memoryReference: string, count: number, offset: number): Promise<Interfaces.MemoryReadResult> {
        const result = await this.retrieveMemory(memoryReference, count, offset);
        try {
            this.variables = await this.memoryProvider.getLocals();
        } catch {
            this.variables = [];
        }
        this.recentLocations.add(memoryReference);
        this.updateDefaults(memoryReference, count, offset);
        return result;
    }

    protected async retrieveMemory(memoryReference: string, count: number, offset: number): Promise<Interfaces.MemoryReadResult> {
        return this.memoryProvider.readMemory({ memoryReference, count, offset });
    }

    // TODO: This may not be necessary if we change how state is stored (currently in the text fields themselves.)
    protected updateDefaults(address: string, readLength: number, offset: number): void {
        this.address = address;
        this.readLength = readLength;
        this.offset = offset;
    }

    // Callbacks for when the various view parameters change.
    /**
     * Handle bytes per row changed event.
     */
    protected onGroupsPerRowChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
        const { value, id } = event.target;
        this.groupsPerRow = parseInt(value);
        this.fireDidChangeOptions(id);
    };

    /**
     * Handle bytes per group changed event.
     */
    protected onBytesPerGroupChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
        const { value, id } = event.target;
        this.bytesPerGroup = parseInt(value);
        this.fireDidChangeOptions(id);
    };

    /**
     * Handle endianness changed event.
     */
    protected onEndiannessChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
        const { value, id } = event.target;
        if (value !== Interfaces.Endianness.Big && value !== Interfaces.Endianness.Little) { return; }
        this.endianness = value;
        this.fireDidChangeOptions(id);
    };

    protected fireDidChangeOptions(targetId?: string): void {
        this.onOptionsChangedEmitter.fire(targetId);
    }

    protected fireDidChangeMemory(): void {
        this.onMemoryChangedEmitter.fire(this.memoryReadResult);
    }
}
