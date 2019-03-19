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
import { CommandRegistry, Command } from '@theia/core/lib/common';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { KeybindingRegistry, SingleTextInputDialog, KeySequence, ConfirmDialog, Message, KeybindingScope } from '@theia/core/lib/browser';
import { KeymapsParser } from './keymaps-parser';
import { KeymapsService, KeybindingJson } from './keymaps-service';
import { AlertMessage } from '@theia/core/lib/browser/widgets/alert-message';

export interface KeybindingItem {
    id: string,
    command: string,
    keybinding?: string,
    context?: string,
    scope?: string,
}

export interface CellData {
    value: string,
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

    protected items: KeybindingItem[];

    static readonly ID = 'keybindings.view.widget';
    static readonly LABEL = 'Keyboard Shortcuts';

    protected query: string = '';

    protected readonly regexp = /<match>(.*?)<\/match>/g;
    protected readonly keybindingSeparator = /<match>\+<\/match>/g;

    protected readonly fuzzyOptions = {
        pre: '<match>',
        post: '</match>',
    };

    protected readonly searchKeybindings: () => void = debounce(() => this.doSearchKeybindings(), 50);

    @postConstruct()
    protected init(): void {
        this.id = KeybindingWidget.ID;
        this.title.label = KeybindingWidget.LABEL;
        this.title.caption = KeybindingWidget.LABEL;
        this.title.iconClass = 'fa fa-bars';
        this.title.closable = true;
        this.update();

        this.items = this.getItems();
        if (this.keymapsService.onDidChangeKeymaps) {
            this.toDispose.push(this.keymapsService.onDidChangeKeymaps(() => {
                this.doSearchKeybindings();
                this.update();
            }));
        }
    }

    protected onActivateRequest(msg: Message) {
        super.onActivateRequest(msg);
        this.focusInputField();
    }

    protected doSearchKeybindings(): void {
        this.items = [];
        const searchField = this.findSearchField();
        this.query = searchField ? searchField.value.trim().toLocaleLowerCase() : '';
        const items = this.getItems();
        items.forEach(item => {
            const keys: (keyof KeybindingItem)[] = ['id', 'command', 'keybinding', 'context', 'scope'];
            let matched = false;
            for (const key of keys) {
                const string = item[key];
                if (string) {
                    const fuzzyMatch = fuzzy.match(this.query, string, this.fuzzyOptions);
                    if (fuzzyMatch) {
                        item[key] = fuzzyMatch.rendered;
                        matched = true;
                    }
                }
            }
            if (matched) {
                this.items.push(item);
            }
        });
        this.update();
    }

    protected findSearchField(): HTMLInputElement | null {
        return document.getElementById('search-kb') as HTMLInputElement;
    }

    protected focusInputField() {
        const input = document.getElementById('search-kb');
        if (input) {
            (input as HTMLInputElement).focus();
            (input as HTMLInputElement).select();
        }
    }

    protected render(): React.ReactNode {
        return <div id='kb-main-container'>
            {this.renderSearch()}
            {(this.items.length > 0) ? this.renderTable() : this.renderMessage()}
        </div>;
    }

    protected renderSearch(): React.ReactNode {
        return <div>
            <div className='search-kb-container'>
                <input id='search-kb'
                    className={(this.items.length > 0) ? '' : 'no-kb'}
                    type='text' placeholder='Search keybindings' onKeyUp={this.searchKeybindings}></input >
            </div>
            <div className='kb-json'>For more detailed keybinding customizations open and edit&nbsp;
                <a href='#' onClick={this.openKeybindings}>keymaps.json</a>
            </div>
        </div>;
    }

    protected renderMessage(): React.ReactNode {
        return <AlertMessage
            type='WARNING'
            header='No results found!'
        />;
    }

    protected renderTable(): React.ReactNode {
        return <div id='kb-table-container'>
            <div className='kb'>
                <table>
                    <thead>
                        <tr>
                            <th className='th-action'></th>
                            <th className='th-label'>Label</th>
                            <th className='th-keybinding'>Keybinding</th>
                            <th className='th-scope'>Scope</th>
                            <th className='th-context'>Context</th>
                            <th className='th-command'>Command</th>
                        </tr>
                    </thead>
                    <tbody>
                        {this.renderRows()}
                    </tbody>
                </table>
            </div>
        </div>;
    }

    protected renderRows(): React.ReactNode {
        return <React.Fragment>
            {
                this.items.map((item, index) =>
                    <tr className='kb-item-row' key={index} onDoubleClick={a => this.editKeybinding(item)}>
                        <td className='kb-actions'>{this.renderActions(item)}</td>
                        <td title={this.getRawValue(item.command)}>{this.renderMatchedData(item.command)}</td>
                        <td title={(item.keybinding) ? this.getRawValue(item.keybinding) : ''} className='monaco-keybinding'>
                            {item.keybinding ? this.renderKeybinding(item.keybinding) : ''}
                        </td>
                        <td title={(item.scope) ? this.getRawValue(item.scope) : ''}>
                            <code className='td-scope'>{item.scope ? this.renderMatchedData(item.scope) : ''}</code>
                        </td>
                        <td title={(item.context) ? this.getRawValue(item.context) : ''}><code>{(item.context) ? this.renderMatchedData(item.context) : ''}</code></td>
                        <td title={this.getRawValue(item.id)}><code>{this.renderMatchedData(item.id)}</code></td>
                    </tr>
                )
            }
        </React.Fragment>;
    }

    protected renderActions(item: KeybindingItem): React.ReactNode {
        return <span>{this.renderEdit(item)}{this.renderReset(item)}</span>;
    }

    protected renderEdit(item: KeybindingItem): React.ReactNode {
        return <a title='Edit Keybinding' href='#' onClick={a => this.editKeybinding(item)}><i className='fa fa-pencil kb-action-item'></i></a>;
    }

    protected renderReset(item: KeybindingItem): React.ReactNode {
        return (item.scope && item.scope === KeybindingScope[1].toLocaleLowerCase())
            ? <a title='Reset Keybinding' href='#' onClick={a => this.resetKeybinding(item)}><i className='fa fa-undo kb-action-item'></i></a> : '';
    }

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

    protected getItems(): KeybindingItem[] {
        const commands = this.commandRegistry.commands.sort((a, b) => this.compareCommands(a, b));
        const items: KeybindingItem[] = [];
        for (let i = 0; i < commands.length; i++) {
            if (!commands[i].label) {
                continue;
            }
            const keybindings = this.keybindingRegistry.getKeybindingsForCommand(commands[i].id);
            const item: KeybindingItem = {
                id: commands[i].id,
                command: commands[i].label || '',
                keybinding: (keybindings && keybindings[0]) ? keybindings[0].keybinding : '',
                context: (keybindings && keybindings[0]) ? keybindings[0].context : '',
                scope: (keybindings && keybindings[0] && typeof keybindings[0].scope !== 'undefined')
                    ? KeybindingScope[keybindings[0].scope!].toLocaleLowerCase() : '',
            };
            items.push(item);
        }
        return items;
    }

    protected compareCommands(a: Command, b: Command): number {
        if (a.label && b.label) {
            return (a.label).localeCompare(b.label);
        } else {
            return 0;
        }
    }

    protected keybindingExistsInJson(keybindings: KeybindingJson[], command: string): boolean {
        for (let i = 0; i < keybindings.length; i++) {
            if (keybindings[i].command === command) {
                return true;
            }
        }
        return false;
    }

    protected editKeybinding(item: KeybindingItem): void {
        const command = this.getRawValue(item.command);
        const id = this.getRawValue(item.id);
        const keybinding = (item.keybinding) ? this.getRawValue(item.keybinding) : '';
        const context = (item.context) ? this.getRawValue(item.context) : '';
        const dialog = new SingleTextInputDialog({
            title: `Edit Keybinding For ${command}`,
            initialValue: keybinding,
            validate: newKeybinding => this.validateKeybinding(command, keybinding, newKeybinding),
        });
        dialog.open().then(async newKeybinding => {
            if (newKeybinding) {
                await this.keymapsService.setKeybinding({ 'command': id, 'keybinding': newKeybinding, 'context': context });
            }
        });
    }

    protected async confirmResetKeybinding(command: string, commandId: string): Promise<boolean> {
        const dialog = new ConfirmDialog({
            title: `Reset keybinding for '${command}'`,
            msg: 'Do you really want to reset this keybinding to its default value?'
        });
        return !!await dialog.open();
    }

    protected async resetKeybinding(item: KeybindingItem): Promise<void> {
        const rawCommandId = this.getRawValue(item.id);
        const rawCommand = this.getRawValue(item.command);
        const confirmed = await this.confirmResetKeybinding(rawCommand, rawCommandId);
        if (confirmed) {
            this.keymapsService.removeKeybinding(rawCommandId);
        }
    }

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

    protected renderMatchedData(item: string): React.ReactNode {
        if (this.query !== '') {
            const cellData = this.buildCellData(item);
            return <React.Fragment>
                {
                    cellData.map((data, index) => (data.highlighted) ? <span key={index} className='fuzzy-match'>{data.value}</span> : <span key={index}>{data.value}</span>)
                }
            </React.Fragment>;
        } else {
            return item;
        }
    }

    protected getRawValue(property: string): string {
        return property.replace(new RegExp(this.regexp), '$1');
    }

    protected openKeybindings = () => this.keymapsService.open(this);

}
