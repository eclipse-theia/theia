/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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

import React = require('react');
import debounce = require('lodash.debounce');
import * as fuzzy from 'fuzzy';
import { injectable, inject, postConstruct } from 'inversify';
import { CommandRegistry, Emitter, Event } from '@theia/core/lib/common';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { KeybindingRegistry, SingleTextInputDialog, KeySequence, ConfirmDialog, Message, KeybindingScope, SingleTextInputDialogProps, Key } from '@theia/core/lib/browser';
import { KeymapsParser } from './keymaps-parser';
import { KeymapsService, KeybindingJson } from './keymaps-service';
import { AlertMessage } from '@theia/core/lib/browser/widgets/alert-message';

/**
 * Representation of a keybinding item for the view.
 */
export interface KeybindingItem {
    /**
     * The id of the command.
     */
    id: string,
    /**
     * The human-readable label of the command.
     */
    command: string,
    /**
     * The keybinding of the command.
     */
    keybinding?: string,
    /**
     * The context / when closure of the command.
     */
    context?: string,
    /**
     * The source of the command.
     */
    source?: string,
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
export class KeybindingWidget extends ReactWidget {

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(KeybindingRegistry)
    protected readonly keybindingRegistry: KeybindingRegistry;

    @inject(KeymapsParser)
    protected readonly keymapsParser: KeymapsParser;

    @inject(KeymapsService)
    protected readonly keymapsService: KeymapsService;

    protected items: KeybindingItem[] = [];

    static readonly ID = 'keybindings.view.widget';
    static readonly LABEL = 'Keyboard Shortcuts';

    /**
     * The current user search query.
     */
    protected query: string = '';

    /**
     * The regular expression used to extract values between fuzzy results.
     */
    protected readonly regexp = /<match>(.*?)<\/match>/g;
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

    protected readonly searchKeybindings: () => void = debounce(() => this.doSearchKeybindings(), 50);

    @postConstruct()
    protected init(): void {
        this.id = KeybindingWidget.ID;
        this.title.label = KeybindingWidget.LABEL;
        this.title.caption = KeybindingWidget.LABEL;
        this.title.iconClass = 'fa fa-bars';
        this.title.closable = true;
        this.update();

        // Initialize the list of keybinding items.
        this.items = this.getItems();

        // Listen to changes made in the `keymaps.json` and update the view accordingly.
        if (this.keymapsService.onDidChangeKeymaps) {
            this.toDispose.push(this.keymapsService.onDidChangeKeymaps(() => {
                this.doSearchKeybindings();
                this.update();
            }));
        }
    }

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

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.focusInputField();
    }

    /**
     * Perform a search based on the user's search query.
     */
    protected doSearchKeybindings(): void {
        this.onDidUpdateEmitter.fire(undefined);
        this.items = [];
        const searchField = this.findSearchField();
        this.query = searchField ? searchField.value.trim().toLocaleLowerCase() : '';
        const items = this.getItems();
        items.forEach(item => {
            const keys: (keyof KeybindingItem)[] = ['command', 'keybinding', 'context', 'source'];
            let matched = false;
            for (const key of keys) {
                const string = item[key];
                if (string) {
                    const fuzzyMatch = fuzzy.match(this.query, string, this.fuzzyOptions);
                    if (fuzzyMatch) {
                        item[key] = fuzzyMatch.rendered;
                        matched = true;
                    } else {
                        // Match identical keybindings that have different orders.
                        if (key === 'keybinding') {
                            const queryItems = this.query.split('+');

                            // Handle key chords.
                            const tempItems = string.split(' ');
                            // Store positions of `space` in the keybinding string.
                            const spaceIndexArr = [0];
                            let bindingItems: string[] = [];
                            if (tempItems.length > 1) {
                                tempItems.forEach(tItem => {
                                    const tKeys = tItem.split('+');
                                    spaceIndexArr.push(tKeys.length + spaceIndexArr[-1]);
                                    bindingItems.push(...tKeys);
                                });
                            } else {
                                bindingItems = string.split('+');
                            }
                            spaceIndexArr.shift();

                            const renderedResult = [...bindingItems];
                            let matchCounter = 0;

                            queryItems.forEach(queryItem => {
                                let keyFuzzyMatch: fuzzy.MatchResult = { rendered: '', score: 0 };
                                let keyIndex = -1;
                                if (string) {
                                    bindingItems.forEach((bindingItem: string) => {
                                        // Match every key in user query with every key in keybinding string.
                                        const tempFuzzyMatch = fuzzy.match(queryItem, bindingItem, this.fuzzyOptions);
                                        // Select the match with the highest matching score.
                                        if (tempFuzzyMatch && tempFuzzyMatch.score > keyFuzzyMatch.score) {
                                            keyFuzzyMatch = tempFuzzyMatch;
                                            // Get index in the keybinding array.
                                            keyIndex = renderedResult.indexOf(bindingItem);
                                        }
                                    });

                                    const keyRendered = keyFuzzyMatch.rendered;
                                    if (keyRendered) {
                                        if (keyIndex > -1) {
                                            renderedResult[keyIndex] = keyRendered;
                                        }
                                        // Remove key from keybinding items if it is matched.
                                        bindingItems.splice(keyIndex, 1, '');
                                        matchCounter += 1;
                                    }
                                }
                            });
                            if (matchCounter === queryItems.length) {
                                // Handle rendering of key chords.
                                if (spaceIndexArr.length > 0) {
                                    const chordRenderedResult = '';
                                    renderedResult.forEach((resultKey, index) => {
                                        if (index === 0) {
                                            chordRenderedResult.concat(resultKey);
                                        } else if (spaceIndexArr.indexOf(index) !== -1) {
                                            chordRenderedResult.concat(' ' + resultKey);
                                        } else {
                                            chordRenderedResult.concat('+' + resultKey);
                                        }
                                    });
                                    item[key] = chordRenderedResult;
                                }

                                item[key] = renderedResult.join('+');
                                matched = true;
                            }
                        }
                    }
                }
            }

            if (matched) {
                this.items.push(item);
            }
        });
        this.update();
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
                    className={(this.items.length > 0) ? '' : 'no-kb'}
                    type='text'
                    placeholder='Search keybindings'
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
                            <th className='th-label'>Command</th>
                            <th className='th-keybinding'>Keybinding</th>
                            <th className='th-context'>Context / When</th>
                            <th className='th-source'>Source</th>
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
            {
                this.items.map((item, index) =>
                    <tr className='kb-item-row' key={index} onDoubleClick={a => this.editKeybinding(item)}>
                        <td className='kb-actions'>
                            {this.renderActions(item)}
                        </td>
                        <td className='kb-label' title={this.getRawValue(item.command)}>
                            {this.renderMatchedData(item.command)}
                        </td>
                        <td title={(item.keybinding) ? this.getRawValue(item.keybinding) : ''} className='kb-keybinding monaco-keybinding'>
                            {item.keybinding ? this.renderKeybinding(item.keybinding) : ''}
                        </td>
                        <td className='kb-context' title={(item.context) ? this.getRawValue(item.context) : ''}>
                            <code>{(item.context) ? this.renderMatchedData(item.context) : ''}</code>
                        </td>
                        <td className='kb-source' title={(item.source) ? this.getRawValue(item.source) : ''}>
                            <code className='td-source'>{item.source ? this.renderMatchedData(item.source) : ''}</code>
                        </td>
                    </tr>
                )
            }
        </React.Fragment>;
    }

    /**
     * Render the actions container with action icons.
     * @param item {KeybindingItem} the keybinding item for the row.
     */
    protected renderActions(item: KeybindingItem): React.ReactNode {
        return <span className='kb-actions-icons'>{this.renderEdit(item)}{this.renderReset(item)}</span>;
    }

    /**
     * Render the edit action used to update a keybinding.
     * @param item {KeybindingItem} the keybinding item for the row.
     */
    protected renderEdit(item: KeybindingItem): React.ReactNode {
        return <a title='Edit Keybinding' href='#' onClick={a => this.editKeybinding(item)}><i className='fa fa-pencil kb-action-item'></i></a>;
    }

    /**
     * Render the reset action to reset the custom keybinding.
     * Only visible if a keybinding has a `user` scope.
     * @param item {KeybindingItem} the keybinding item for the row.
     */
    protected renderReset(item: KeybindingItem): React.ReactNode {
        return (item.source && this.getRawValue(item.source) === KeybindingScope[1].toLocaleLowerCase())
            ? <a title='Reset Keybinding' href='#' onClick={a => this.resetKeybinding(item)}><i className='fa fa-undo kb-action-item'></i></a> : '';
    }

    /**
     * Render the keybinding.
     * @param keybinding {string} the keybinding value.
     */
    protected renderKeybinding(keybinding: string): React.ReactNode {
        const regex = new RegExp(this.keybindingSeparator);
        keybinding = keybinding.replace(regex, '+');
        const keys = keybinding.split('+');

        return <React.Fragment>
            {
                keys.map((key, index) => {
                    if (index === 0) {
                        return <span key={index} className='monaco-keybinding-key'>
                            {this.renderMatchedData(key)}
                        </span>;
                    } else if (key.includes(' ')) {
                        // Handle key chords, which have space as the separator
                        // Example: `k Ctrl` in key chords `Ctrl+k Ctrl+p`
                        let chordKeys = key.split('<match> </match>');
                        if (chordKeys.length === 1) {
                            chordKeys = key.split(' ');
                        }
                        return <React.Fragment key={index}>
                            <span className='monaco-keybinding-separator'>+</span>
                            <span className='monaco-keybinding-key'>{this.renderKeybinding(chordKeys[0])}</span>
                            <span className='monaco-keybinding-separator'>&nbsp;&nbsp;</span>
                            <span className='monaco-keybinding-key'>{this.renderKeybinding(chordKeys[1])}</span>
                        </React.Fragment>;
                    } else {
                        return <React.Fragment key={index}>
                            <span className='monaco-keybinding-separator'>+</span>
                            <span className='monaco-keybinding-key'>{this.renderKeybinding(key)}</span>
                        </React.Fragment>;
                    }
                })
            }
        </React.Fragment>;
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
            // Obtain the keybinding for the given command.
            const keybindings = this.keybindingRegistry.getKeybindingsForCommand(commands[i].id);
            const item: KeybindingItem = {
                id: commands[i].id,
                // Get the command label if available, else use the keybinding id.
                command: commands[i].label || commands[i].id,
                keybinding: (keybindings && keybindings[0]) ? keybindings[0].keybinding : '',
                context: (keybindings && keybindings[0])
                    ? keybindings[0].context
                        ? keybindings[0].context : keybindings[0].when
                    : '',
                source: (keybindings && keybindings[0] && typeof keybindings[0].scope !== 'undefined')
                    ? KeybindingScope[keybindings[0].scope!].toLocaleLowerCase() : '',
            };
            items.push(item);
        }
        // Sort the keybinding item by label.
        const sorted: KeybindingItem[] = items.sort((a: KeybindingItem, b: KeybindingItem) => this.compareItem(a.command, b.command));
        // Get the list of keybinding item with keybindings (visually put them at the top of the table).
        const keyItems: KeybindingItem[] = sorted.filter((a: KeybindingItem) => !!a.keybinding);
        // Get the remaining keybinding items (without keybindings).
        const otherItems: KeybindingItem[] = sorted.filter((a: KeybindingItem) => !a.keybinding);

        // Return the list of keybinding items prioritizing those with a defined keybinding.
        return [...keyItems, ...otherItems];
    }

    /**
     * Compare two strings.
     * @param a {string | undefined} the first string.
     * @param b {string | undefined} the second string.
     */
    protected compareItem(a: string | undefined, b: string | undefined): number {
        if (a && b) {
            return (a.toLowerCase()).localeCompare(b.toLowerCase());
        }
        return 0;
    }

    /**
     * Determine if the keybinding currently exists in a user's `keymaps.json`.
     *
     * @returns `true` if the keybinding exists.
     */
    protected keybindingExistsInJson(keybindings: KeybindingJson[], command: string): boolean {
        for (let i = 0; i < keybindings.length; i++) {
            if (keybindings[i].command === command) {
                return true;
            }
        }
        return false;
    }

    /**
     * Prompt users to update the keybinding for the given command.
     * @param item {KeybindingItem} the keybinding item.
     */
    protected editKeybinding(item: KeybindingItem): void {
        const command = this.getRawValue(item.command);
        const id = this.getRawValue(item.id);
        const keybinding = (item.keybinding) ? this.getRawValue(item.keybinding) : '';
        const context = (item.context) ? this.getRawValue(item.context) : '';
        const dialog = new EditKeybindingDialog({
            title: `Edit Keybinding For ${command}`,
            initialValue: keybinding,
            validate: newKeybinding => this.validateKeybinding(command, keybinding, newKeybinding),
        }, this.keymapsService, item);
        dialog.open().then(async newKeybinding => {
            if (newKeybinding) {
                await this.keymapsService.setKeybinding({ 'command': id, 'keybinding': newKeybinding, 'context': context });
            }
        });
    }

    /**
     * Prompt users for confirmation before resetting.
     * @param command {string} the command label.
     *
     * @returns a Promise which resolves to `true` if a user accepts resetting.
     */
    protected async confirmResetKeybinding(command: string): Promise<boolean> {
        const dialog = new ConfirmDialog({
            title: `Reset keybinding for '${command}'`,
            msg: 'Do you really want to reset this keybinding to its default value?'
        });
        return !!await dialog.open();
    }

    /**
     * Reset the keybinding to its default value.
     * @param item {KeybindingItem} the keybinding item.
     */
    protected async resetKeybinding(item: KeybindingItem): Promise<void> {
        const rawCommandId = this.getRawValue(item.id);
        const rawCommand = this.getRawValue(item.command);
        const confirmed = await this.confirmResetKeybinding(rawCommand);
        if (confirmed) {
            this.keymapsService.removeKeybinding(rawCommandId);
        }
    }

    /**
     * Validate the provided keybinding value against its previous value.
     * @param command {string} the command label.
     * @param oldKeybinding {string} the old keybinding value.
     * @param keybinding {string} the new keybinding value.
     *
     * @returns the end user message to display.
     */
    protected validateKeybinding(command: string, oldKeybinding: string, keybinding: string): string {
        if (!keybinding) {
            return 'keybinding value is required';
        }
        try {
            const binding = { 'command': command, 'keybinding': keybinding };
            KeySequence.parse(keybinding);
            if (oldKeybinding === keybinding) {
                return ' '; // if old and new keybindings match, quietly reject update
            }
            if (this.keybindingRegistry.containsKeybindingInScope(binding)) {
                return 'keybinding currently collides';
            }
            return '';
        } catch (error) {
            return error;
        }
    }

    /**
     * Build the cell data with highlights if applicable.
     * @param raw {string} the raw cell value.
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
     * @param property {string} one of the `KeybindingItem` properties.
     */
    protected renderMatchedData(property: string): React.ReactNode {
        if (this.query !== '') {
            const cellData = this.buildCellData(property);
            return <React.Fragment>
                {
                    cellData.map((data, index) => (data.highlighted) ? <span key={index} className='fuzzy-match'>{data.value}</span> : <span key={index}>{data.value}</span>)
                }
            </React.Fragment>;
        } else {
            return property;
        }
    }

    /**
     * Render the raw value of a item without fuzzy highlighting.
     * @param property {string} one of the `KeybindingItem` properties.
     */
    protected getRawValue(property: string): string {
        return property.replace(new RegExp(this.regexp), '$1');
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
        @inject(SingleTextInputDialogProps) protected readonly props: SingleTextInputDialogProps,
        @inject(KeymapsService) protected readonly keymapsService: KeymapsService,
        item: KeybindingItem
    ) {
        super(props);
        this.item = item;
        // Add the `Reset` button if the command currently has a custom keybinding.
        if (this.item.source &&
            this.getRaw(this.item.source) === KeybindingScope[1].toLocaleLowerCase()) {
            this.appendResetButton();
        }
    }

    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        if (this.resetButton) {
            this.addResetAction(this.resetButton, 'click');
        }
    }

    /**
     * Add `Reset` action used to reset a custom keybinding, and close the dialog.
     * @param element {HTMLElement} the HTML element in question.
     * @param additionalEventTypes {K[]} additional event types.
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
        this.resetButton = this.createButton('Reset');
        // Add the `Reset` button to the dialog control panel, before the `Accept` button.
        this.controlPanel.insertBefore(this.resetButton, this.acceptButton!);
        this.resetButton.title = 'Reset Keybinding';
        this.resetButton.classList.add('secondary');
        return this.resetButton;
    }

    /**
     * Perform keybinding reset.
     */
    protected reset(): void {
        // Extract the raw id from the keybinding item (without fuzzy matching).
        const id = this.getRaw(this.item.id);
        // Remove the custom keybinding, resetting it to its default value.
        this.keymapsService.removeKeybinding(id);
    }

    /**
     * Extract the raw value from a string (without fuzzy matching).
     * @param a {string} given string value for extraction.
     *
     * @returns the raw value of a string without any fuzzy matching.
     */
    protected getRaw(a: string): string {
        return a.replace(new RegExp(/<match>(.*?)<\/match>/g), '$1');
    }

}
