// *****************************************************************************
// Copyright (C) 2018 Ericsson and others.
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

import React = require('@theia/core/shared/react');
import debounce = require('@theia/core/shared/lodash.debounce');
import * as fuzzy from '@theia/core/shared/fuzzy';
import { injectable, inject, postConstruct, unmanaged } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { CommandRegistry, Command } from '@theia/core/lib/common/command';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import {
    KeybindingRegistry, SingleTextInputDialog, KeySequence, ConfirmDialog, Message, KeybindingScope,
    SingleTextInputDialogProps, Key, ScopedKeybinding, codicon, StatefulWidget, Widget
} from '@theia/core/lib/browser';
import { KeymapsService } from './keymaps-service';
import { AlertMessage } from '@theia/core/lib/browser/widgets/alert-message';
import { DisposableCollection, isOSX } from '@theia/core';
import { nls } from '@theia/core/lib/common/nls';

/**
 * Representation of a keybinding item for the view.
 */
export interface KeybindingItem {
    command: Command
    keybinding?: ScopedKeybinding
    /** human-readable labels can contain highlighting */
    labels: {
        id: RenderableLabel;
        command: RenderableLabel;
        keybinding: RenderableLabel;
        context: RenderableLabel;
        source: RenderableLabel;
    }
    visible?: boolean;
}

export interface RenderableLabel {
    readonly value: string;
    segments?: RenderableStringSegment[];
}

export interface RenderableStringSegment {
    value: string;
    match: boolean;
    key?: boolean;
}

/**
 * Representation of an individual table cell.
 */
export interface CellData {
    /**
     * The cell value.
     */
    value: string,
    /**
     * Indicates if a cell's value is currently highlighted.
     */
    highlighted: boolean,
}

@injectable()
export class KeybindingWidget extends ReactWidget implements StatefulWidget {

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(KeybindingRegistry)
    protected readonly keybindingRegistry: KeybindingRegistry;

    @inject(KeymapsService)
    protected readonly keymapsService: KeymapsService;

    static readonly ID = 'keybindings.view.widget';
    static readonly LABEL = nls.localizeByDefault('Keyboard Shortcuts');

    /**
     * The list of all available keybindings.
     */
    protected items: KeybindingItem[] = [];

    /**
     * The current user search query.
     */
    protected query: string = '';

    /**
     * The regular expression used to extract values between fuzzy results.
     */
    protected readonly regexp = /<match>(.*?)<\/match>/g;
    /**
     * The regular expression used to extract values between the keybinding separator.
     */
    protected readonly keybindingSeparator = /<match>\+<\/match>/g;

    /**
     * The fuzzy search options.
     * The `pre` and `post` options are used to wrap fuzzy matches.
     */
    protected readonly fuzzyOptions = {
        pre: '<match>',
        post: '</match>',
    };

    protected readonly onDidUpdateEmitter = new Emitter<void>();
    readonly onDidUpdate: Event<void> = this.onDidUpdateEmitter.event;
    protected readonly onRenderCallbacks = new DisposableCollection();
    protected onRender = () => this.onRenderCallbacks.dispose();

    /**
     * Search keybindings.
     */
    protected readonly searchKeybindings: () => void = debounce(() => this.doSearchKeybindings(), 50);

    constructor(@unmanaged() options?: Widget.IOptions) {
        super(options);
        this.onRender = this.onRender.bind(this);
    }

    /**
     * Initialize the widget.
     */
    @postConstruct()
    protected init(): void {
        this.id = KeybindingWidget.ID;
        this.title.label = KeybindingWidget.LABEL;
        this.title.caption = KeybindingWidget.LABEL;
        this.title.iconClass = codicon('three-bars');
        this.title.closable = true;
        this.updateItemsAndRerender();

        // Listen to changes made in the `keymaps.json` and update the view accordingly.
        if (this.keymapsService.onDidChangeKeymaps) {
            this.toDispose.push(this.keymapsService.onDidChangeKeymaps(() => {
                this.items = this.getItems();
                this.doSearchKeybindings();
            }));
        }
        this.toDispose.push(this.keybindingRegistry.onKeybindingsChanged(this.updateItemsAndRerender));
    }

    protected updateItemsAndRerender = debounce(() => {
        this.items = this.getItems();
        this.update();
        if (this.hasSearch()) {
            this.doSearchKeybindings();
        }
    }, 100, { leading: false, trailing: true });

    /**
     * Determine if there currently is a search term.
     * @returns `true` if a search term is present.
     */
    public hasSearch(): boolean {
        return !!this.query.length;
    }

    /**
     * Clear the search and reset the view.
     */
    public clearSearch(): void {
        const search = this.findSearchField();
        if (search) {
            search.value = '';
            this.query = '';
            this.doSearchKeybindings();
        }
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.focusInputField();
    }

    /**
     * Perform a search based on the user's search query.
     */
    protected doSearchKeybindings(): void {
        this.onDidUpdateEmitter.fire(undefined);
        const searchField = this.findSearchField();
        this.query = searchField ? searchField.value.trim().toLocaleLowerCase() : '';
        const queryItems = this.query.split(/[+\s]/);
        this.items.forEach(item => {
            let matched = !this.query;
            matched = this.formatAndMatchCommand(item) || matched;
            matched = this.formatAndMatchKeybinding(item, queryItems) || matched;
            matched = this.formatAndMatchContext(item) || matched;
            matched = this.formatAndMatchSource(item) || matched;
            item.visible = matched;
        });
        this.update();
    }

    protected formatAndMatchCommand(item: KeybindingItem): boolean {
        item.labels.command = this.toRenderableLabel(item.labels.command.value);
        return Boolean(item.labels.command.segments);
    }

    protected formatAndMatchKeybinding(item: KeybindingItem, queryItems: string[]): boolean {
        if (item.keybinding) {
            let match = false;
            const segments = this.keybindingRegistry.resolveKeybinding(item.keybinding).reduce<RenderableStringSegment[]>((collection, code, codeIndex) => {
                if (codeIndex !== 0) {
                    // Two non-breaking spaces.
                    collection.push({ value: '\u00a0\u00a0', match: false, key: false });
                }
                const displayChunks = this.keybindingRegistry.componentsForKeyCode(code);
                const matchChunks = isOSX ? this.keybindingRegistry.componentsForKeyCode(code, true) : displayChunks;

                displayChunks.forEach((chunk, chunkIndex) => {
                    if (chunkIndex !== 0) {
                        collection.push({ value: '+', match: false, key: false });
                    }
                    const chunkMatches = queryItems.includes(matchChunks[chunkIndex].toLocaleLowerCase());
                    match ||= chunkMatches;
                    collection.push({ value: chunk, match: chunkMatches, key: true });
                });
                return collection;
            }, []);
            item.labels.keybinding = { value: item.labels.keybinding.value, segments };
            return match;
        }
        item.labels.keybinding = { value: '' };
        return false;
    }

    protected formatAndMatchContext(item: KeybindingItem): boolean {
        item.labels.context = this.toRenderableLabel(item.labels.context.value);
        return Boolean(item.labels.context.segments);
    }

    protected formatAndMatchSource(item: KeybindingItem): boolean {
        item.labels.source = this.toRenderableLabel(item.labels.source.value);
        return Boolean(item.labels.source.segments);
    }

    protected toRenderableLabel(label: string, query: string = this.query): RenderableLabel {
        if (label && query) {
            const fuzzyMatch = fuzzy.match(query, label, this.fuzzyOptions);
            if (fuzzyMatch) {
                return {
                    value: label,
                    segments: fuzzyMatch.rendered.split(this.fuzzyOptions.pre).reduce<RenderableStringSegment[]>((collection, segment) => {
                        const [maybeMatch, notMatch] = segment.split(this.fuzzyOptions.post);
                        if (notMatch === undefined) {
                            collection.push({ value: maybeMatch, match: false });
                        } else {
                            collection.push({ value: maybeMatch, match: true }, { value: notMatch, match: false });
                        }
                        return collection;
                    }, [])
                };
            }
        }
        return { value: label };
    }

    /**
     * Get the search input if available.
     * @returns the search input if available.
     */
    protected findSearchField(): HTMLInputElement | null {
        return document.getElementById('search-kb') as HTMLInputElement;
    }

    /**
     * Set the focus the search input field if available.
     */
    protected focusInputField(): void {
        const input = document.getElementById('search-kb');
        if (input) {
            (input as HTMLInputElement).focus();
            (input as HTMLInputElement).select();
        }
    }

    /**
     * Render the view.
     */
    protected render(): React.ReactNode {
        return <div id='kb-main-container'>
            {this.renderSearch()}
            {(this.items.length > 0) ? this.renderTable() : this.renderMessage()}
        </div>;
    }

    /**
     * Render the search container with the search input.
     */
    protected renderSearch(): React.ReactNode {
        return <div>
            <div className='search-kb-container'>
                <input
                    id='search-kb'
                    ref={this.onRender}
                    className={`theia-input${(this.items.length > 0) ? '' : ' no-kb'}`}
                    type='text'
                    spellCheck={false}
                    placeholder={nls.localizeByDefault('Type to search in keybindings')}
                    autoComplete='off'
                    onKeyUp={this.searchKeybindings}
                />
            </div>
        </div>;
    }

    /**
     * Render the warning message when no search results are found.
     */
    protected renderMessage(): React.ReactNode {
        return <AlertMessage
            type='WARNING'
            header='No results found!'
        />;
    }

    /**
     * Render the keybindings table.
     */
    protected renderTable(): React.ReactNode {
        return <div id='kb-table-container'>
            <div className='kb'>
                <table>
                    <thead>
                        <tr>
                            <th className='th-action'></th>
                            <th className='th-label'>{nls.localizeByDefault('Command')}</th>
                            <th className='th-keybinding'>{nls.localizeByDefault('Keybinding')}</th>
                            <th className='th-context'>{nls.localizeByDefault('When')}</th>
                            <th className='th-source'>{nls.localizeByDefault('Source')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {this.renderRows()}
                    </tbody>
                </table>
            </div>
        </div>;
    }

    /**
     * Render the table rows.
     */
    protected renderRows(): React.ReactNode {
        return <React.Fragment>
            {this.items.map((item, index) => item.visible !== false && this.renderRow(item, index))}
        </React.Fragment>;
    }

    protected renderRow(item: KeybindingItem, index: number): React.ReactNode {
        const { command, keybinding } = item;
        // TODO get rid of array functions in event handlers
        return <tr className='kb-item-row' key={index} onDoubleClick={() => this.editKeybinding(item)}>
            <td className='kb-actions'>
                {this.renderActions(item)}
            </td>
            <td className='kb-label' title={this.getCommandLabel(command)}>
                {this.renderMatchedData(item.labels.command)}
            </td>
            <td title={this.getKeybindingLabel(keybinding)} className='kb-keybinding monaco-keybinding'>
                {this.renderKeybinding(item)}
            </td>
            <td className='kb-context' title={this.getContextLabel(keybinding)}>
                <code>{this.renderMatchedData(item.labels.context)}</code>
            </td>
            <td className='kb-source' title={this.getScopeLabel(keybinding)}>
                <code className='td-source'>{this.renderMatchedData(item.labels.source)}</code>
            </td>
        </tr>;
    }

    /**
     * Render the actions container with action icons.
     * @param item the keybinding item for the row.
     */
    protected renderActions(item: KeybindingItem): React.ReactNode {
        return <span className='kb-actions-icons'>{this.renderEdit(item)}{this.renderReset(item)}</span>;
    }

    /**
     * Render the edit action used to update a keybinding.
     * @param item the keybinding item for the row.
     */
    protected renderEdit(item: KeybindingItem): React.ReactNode {
        return <a title='Edit Keybinding' href='#' onClick={e => {
            e.preventDefault();
            this.editKeybinding(item);
        }}><i className={`${codicon('edit')} kb-action-item`}></i></a>;
    }

    /**
     * Render the reset action to reset the custom keybinding.
     * Only visible if a keybinding has a `user` scope.
     * @param item the keybinding item for the row.
     */
    protected renderReset(item: KeybindingItem): React.ReactNode {
        return (item.keybinding && item.keybinding.scope === KeybindingScope.USER)
            ? <a title='Reset Keybinding' href='#' onClick={e => {
                e.preventDefault();
                this.resetKeybinding(item);
            }}><i className={`${codicon('discard')} kb-action-item`}></i></a> : '';
    }

    /**
     * Render the keybinding.
     * @param keybinding the keybinding value.
     */
    protected renderKeybinding(keybinding: KeybindingItem): React.ReactNode {
        if (!keybinding.keybinding) {
            return undefined;
        }

        if (keybinding.labels.keybinding.segments) {
            return keybinding.labels.keybinding.segments.map((segment, index) => {
                if (segment.key) {
                    return <span key={index} className='monaco-keybinding-key'>
                        <span className={`${segment.match ? 'fuzzy-match' : ''}`}>{segment.value}</span>
                    </span>;
                } else {
                    return <span key={index} className='monaco-keybinding-separator'>
                        {segment.value}
                    </span>;
                }
            });
        }

        console.warn('Unexpectedly encountered a keybinding without segment divisions');
        return keybinding.labels.keybinding.value;
    }

    /**
     * Get the list of keybinding items.
     *
     * @returns the list of keybinding items.
     */
    protected getItems(): KeybindingItem[] {
        // Sort the commands alphabetically.
        const commands = this.commandRegistry.commands;
        const items: KeybindingItem[] = [];
        // Build the keybinding items.
        for (let i = 0; i < commands.length; i++) {
            const command = commands[i];
            // Skip internal commands prefixed by `_`.
            if (command.id.startsWith('_')) {
                continue;
            }
            const keybindings = this.keybindingRegistry.getKeybindingsForCommand(command.id);
            keybindings.forEach(keybinding => {
                const item = this.createKeybindingItem(command, keybinding);
                items.push(item);
            });
            // we might not have any keybindings for the command
            if (keybindings.length < 1) {
                const item = this.createKeybindingItem(command);
                items.push(item);
            }
        }

        return this.sortKeybindings(items);
    }

    protected createKeybindingItem(command: Command, keybinding?: ScopedKeybinding): KeybindingItem {
        const item = {
            command,
            keybinding,
            labels: {
                id: { value: command.id },
                command: { value: this.getCommandLabel(command) },
                keybinding: { value: this.getKeybindingLabel(keybinding) || '' },
                context: { value: this.getContextLabel(keybinding) || '' },
                source: { value: this.getScopeLabel(keybinding) || '' }
            }
        };
        this.formatAndMatchCommand(item);
        this.formatAndMatchKeybinding(item, []);
        this.formatAndMatchContext(item);
        this.formatAndMatchSource(item);
        return item;
    }

    /**
     * @returns the input array, sorted.
     * The sort priority is as follows: items with keybindings before those without, then alphabetical by command.
     */
    protected sortKeybindings(bindings: KeybindingItem[]): KeybindingItem[] {
        return bindings.sort((a, b) => {
            if (a.keybinding && !b.keybinding) {
                return -1;
            }
            if (b.keybinding && !a.keybinding) {
                return 1;
            }
            return this.compareItem(a.command, b.command);
        });
    }

    /**
     * Get the human-readable label for a given command.
     * @param command the command.
     *
     * @returns a human-readable label for the given command.
     */
    protected getCommandLabel(command: Command): string {
        if (command.label) {
            // Prefix the command label with the category if it exists, else return the simple label.
            return command.category ? `${command.category}: ${command.label}` : command.label;
        }
        return command.id;
    }

    protected getKeybindingLabel(keybinding: ScopedKeybinding | undefined): string | undefined {
        return keybinding && keybinding.keybinding;
    }

    protected getContextLabel(keybinding: ScopedKeybinding | undefined): string | undefined {
        return keybinding ? keybinding.context || keybinding.when : undefined;
    }

    protected getScopeLabel(keybinding: ScopedKeybinding | undefined): string | undefined {
        let scope = keybinding && keybinding.scope;
        if (scope !== undefined) {
            if (scope < KeybindingScope.USER) {
                scope = KeybindingScope.DEFAULT;
            }
            return KeybindingScope[scope].toLocaleLowerCase();
        }
        return undefined;
    }

    /**
     * Compare two commands.
     * - Commands with a label should be prioritized and alphabetically sorted.
     * - Commands without a label (id) should be placed at the bottom.
     * @param a the first command.
     * @param b the second command.
     *
     * @returns an integer indicating whether `a` comes before, after or is equivalent to `b`.
     * - returns `-1` if `a` occurs before `b`.
     * - returns `1` if `a` occurs after `b`.
     * - returns `0` if they are equivalent.
     */
    protected compareItem(a: Command, b: Command): number {
        const labelA = this.getCommandLabel(a);
        const labelB = this.getCommandLabel(b);
        if (labelA === a.id && labelB === b.id) {
            return labelA.toLowerCase().localeCompare(labelB.toLowerCase());
        }
        if (labelA === a.id) {
            return 1;
        }
        if (labelB === b.id) {
            return -1;
        }
        return labelA.toLowerCase().localeCompare(labelB.toLowerCase());
    }

    /**
     * Prompt users to update the keybinding for the given command.
     * @param item the keybinding item.
     */
    protected editKeybinding(item: KeybindingItem): void {
        const command = item.command.id;
        const oldKeybinding = item.keybinding;
        const dialog = new EditKeybindingDialog({
            title: nls.localize('theia/keymaps/editKeybindingTitle', 'Edit Keybinding for {0}', command),
            initialValue: oldKeybinding?.keybinding,
            validate: newKeybinding => this.validateKeybinding(command, oldKeybinding?.keybinding, newKeybinding),
        }, this.keymapsService, item);
        dialog.open().then(async keybinding => {
            if (keybinding) {
                await this.keymapsService.setKeybinding({
                    ...item.keybinding,
                    command,
                    keybinding
                }, oldKeybinding);
            }
        });
    }

    /**
     * Prompt users for confirmation before resetting.
     * @param command the command label.
     *
     * @returns a Promise which resolves to `true` if a user accepts resetting.
     */
    protected async confirmResetKeybinding(item: KeybindingItem): Promise<boolean> {
        const message = document.createElement('div');
        const question = document.createElement('p');
        question.textContent = nls.localize('theia/keymaps/resetKeybindingConfirmation', 'Do you really want to reset this keybinding to its default value?');
        message.append(question);
        const info = document.createElement('p');
        info.textContent = nls.localize('theia/keymaps/resetMultipleKeybindingsWarning', 'If multiple keybindings exist for this command, all of them will be reset.');
        message.append(info);

        const dialog = new ConfirmDialog({
            title: nls.localize('theia/keymaps/resetKeybindingTitle', 'Reset keybinding for {0}', this.getCommandLabel(item.command)),
            msg: message
        });
        return !!await dialog.open();
    }

    /**
     * Reset the keybinding to its default value.
     * @param item the keybinding item.
     */
    protected async resetKeybinding(item: KeybindingItem): Promise<void> {
        const confirmed = await this.confirmResetKeybinding(item);
        if (confirmed) {
            this.keymapsService.removeKeybinding(item.command.id);
        }
    }

    /**
     * Validate the provided keybinding value against its previous value.
     * @param command the command label.
     * @param oldKeybinding the old keybinding value.
     * @param keybinding the new keybinding value.
     *
     * @returns the end user message to display.
     */
    protected validateKeybinding(command: string, oldKeybinding: string | undefined, keybinding: string): string {
        if (!keybinding) {
            return nls.localize('theia/keymaps/requiredKeybindingValidation', 'keybinding value is required');
        }
        try {
            const binding = { command, keybinding };
            KeySequence.parse(keybinding);
            if (oldKeybinding === keybinding) {
                return ' '; // if old and new keybindings match, quietly reject update
            }
            if (this.keybindingRegistry.containsKeybindingInScope(binding)) {
                return nls.localize('theia/keymaps/keybindingCollidesValidation', 'keybinding currently collides');
            }
            return '';
        } catch (error) {
            return error;
        }
    }

    /**
     * Build the cell data with highlights if applicable.
     * @param raw the raw cell value.
     *
     * @returns the list of cell data.
     */
    protected buildCellData(raw: string): CellData[] {
        const data: CellData[] = [];

        if (this.query === '') {
            return data;
        }

        let following = raw;
        let leading;
        let result;

        const regexp = new RegExp(this.regexp);

        while (result = regexp.exec(raw)) {
            const splitLeftIndex = following.indexOf(result[0]);
            const splitRightIndex = splitLeftIndex + result[0].length;

            leading = following.slice(0, splitLeftIndex);
            following = following.slice(splitRightIndex);

            if (leading) {
                data.push({ value: leading, highlighted: false });
            }
            data.push({ value: result[1], highlighted: true });
        }

        if (following) {
            data.push({ value: following, highlighted: false });
        }

        return data;
    }

    /**
     * Render the fuzzy representation of a matched result.
     * @param property one of the `KeybindingItem` properties.
     */
    protected renderMatchedData(property: RenderableLabel): React.ReactNode {
        if (property.segments) {
            return <>
                {
                    property.segments.map((segment, index) => segment.match
                        ? <span key={index} className='fuzzy-match'>{segment.value}</span>
                        : <span key={index}>{segment.value}</span>)
                }
            </>;
        }
        return property.value;
    }

    storeState(): object | undefined {
        return { query: this.query };
    }

    restoreState(oldState: { query: string }): void {
        if (typeof oldState?.query === 'string') {
            this.onRenderCallbacks.push({
                dispose: () => {
                    const searchField = this.findSearchField();
                    if (searchField) {
                        searchField.value = oldState.query;
                        this.searchKeybindings();
                    }
                }
            });
        }
    }
}
/**
 * Dialog used to edit keybindings, and reset custom keybindings.
 */
class EditKeybindingDialog extends SingleTextInputDialog {

    /**
     * The keybinding item in question.
     */
    protected item: KeybindingItem;

    /**
     * HTMLButtonElement used to reset custom keybindings.
     * Custom keybindings have a `User` scope (exist in `keymaps.json`).
     */
    protected resetButton: HTMLButtonElement | undefined;

    constructor(
        @inject(SingleTextInputDialogProps) props: SingleTextInputDialogProps,
        @inject(KeymapsService) protected readonly keymapsService: KeymapsService,
        item: KeybindingItem
    ) {
        super(props);
        this.item = item;
        // Add the `Reset` button if the command currently has a custom keybinding.
        if (this.item.keybinding && this.item.keybinding.scope === KeybindingScope.USER) {
            this.appendResetButton();
        }
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        if (this.resetButton) {
            this.addResetAction(this.resetButton, 'click');
        }
    }

    /**
     * Add `Reset` action used to reset a custom keybinding, and close the dialog.
     * @param element the HTML element in question.
     * @param additionalEventTypes additional event types.
     */
    protected addResetAction<K extends keyof HTMLElementEventMap>(element: HTMLElement, ...additionalEventTypes: K[]): void {
        this.addKeyListener(element, Key.ENTER, () => {
            this.reset();
            this.close();
        }, ...additionalEventTypes);
    }

    /**
     * Create the `Reset` button, and append it to the dialog.
     *
     * @returns the `Reset` button.
     */
    protected appendResetButton(): HTMLButtonElement {
        // Create the `Reset` button.
        const resetButtonTitle = nls.localizeByDefault('Reset');
        this.resetButton = this.createButton(resetButtonTitle);
        // Add the `Reset` button to the dialog control panel, before the `Accept` button.
        this.controlPanel.insertBefore(this.resetButton, this.acceptButton!);
        this.resetButton.title = nls.localizeByDefault('Reset Keybinding');
        this.resetButton.classList.add('secondary');
        return this.resetButton;
    }

    /**
     * Perform keybinding reset.
     */
    protected reset(): void {
        this.keymapsService.removeKeybinding(this.item.command.id);
    }

}
