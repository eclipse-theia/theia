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
import { CommandRegistry, Command, MessageService } from '@theia/core/lib/common';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { KeybindingRegistry, SingleTextInputDialog, KeySequence, ConfirmDialog } from '@theia/core/lib/browser';
import { KeymapsParser } from './keymaps-parser';
import { KeymapsService, KeybindingJson } from './keymaps-service';

export interface KeybindingItem {
    id: string,
    command: string,
    keybinding?: string,
    context?: string,
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

    @inject(MessageService)
    protected readonly messageService: MessageService;

    protected items: KeybindingItem[];

    static readonly ID = 'keybindings.view.widget';

    protected query: string = '';

    protected readonly regexp = /<match>(.*?)<\/match>/g;
    protected readonly keybindingSeperator = /<match>\+<\/match>/g;

    protected readonly fuzzyOptions = {
        pre: '<match>',
        post: '</match>',
    };

    protected readonly searchKeybindings: () => void = debounce(() => this.doSearchKeybindings(), 50);

    constructor() {
        super();
        this.id = KeybindingWidget.ID;
        this.title.label = 'Keyboard Shortcuts';
        this.title.closable = true;
        this.update();
    }

    @postConstruct()
    protected init(): void {
        this.items = this.getItems();
        if (this.keymapsService.onDidChangeKeymaps) {
            this.keymapsService.onDidChangeKeymaps(() => {
                this.doSearchKeybindings();
                this.update();
            });
        }
    }

    protected doSearchKeybindings(): void {
        this.items = [];
        const searchField = this.findSearchField();
        this.query = searchField ? searchField.value.trim().toLocaleLowerCase() : '';
        const items = this.getItems();
        items.forEach(item => {
            const keys: (keyof KeybindingItem)[] = ['id', 'command', 'keybinding', 'context'];
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

    protected render(): React.ReactNode {
        return <div>
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
        return <div className='search-notification'><div>No results found!</div></div>;
    }

    protected renderTable(): React.ReactNode {
        return <div>
            <div className='kb'>
                <table>
                    <thead>
                        <tr>
                            <th></th>
                            <th>Label</th>
                            <th>Keybinding</th>
                            <th>Command</th>
                            <th>Context</th>
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
                        <td>
                            <a href='#' onClick={a => this.editKeybinding(item)}>
                                <i className='fa fa-pencil kb-edit'></i>
                            </a>
                            <a href='#' onClick={a => this.removeKeybinding(item)}>
                                <i className='fa fa-undo kb-edit'></i>
                            </a>
                        </td>
                        <td>{this.renderMatchedData(item.command)}</td>
                        <td className='monaco-keybinding'>
                            {item.keybinding ? this.renderKeybinding(item.keybinding) : ''}
                        </td>
                        <td><code>{this.renderMatchedData(item.id)}</code></td>
                        <td><code>{(item.context) ? this.renderMatchedData(item.context) : ''}</code></td>
                    </tr>
                )
            }
        </React.Fragment>;
    }

    protected renderKeybinding(keybinding: string): React.ReactNode {
        const regex = new RegExp(this.keybindingSeperator);
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
                            <span className='monco-keybinding-seperator'>+</span>
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
                context: (keybindings && keybindings[0]) ? keybindings[0].context : ''
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
        const regexp = new RegExp(this.regexp);
        const rawCommand = item.command.replace(regexp, '$1');
        const rawId = item.id.replace(regexp, '$1');
        const rawKeybinding = (item.keybinding) ? item.keybinding.replace(regexp, '$1') : '';
        const dialog = new SingleTextInputDialog({
            title: `Edit Keybinding For ${rawCommand}`,
            initialValue: rawKeybinding,
            validate: keybinding => this.validateKeybinding(rawCommand, keybinding),
        });
        dialog.open().then(async keybinding => {
            if (keybinding) {
                await this.keymapsService.setKeybinding(rawId, keybinding);
            }
        });
    }

    protected async confirmRemoveKeybinding(command: string, commandId: string): Promise<boolean> {
        const keybindings = await this.keymapsService.getKeybindings();
        const exists = this.keybindingExistsInJson(keybindings, commandId);
        if (!exists) {
            this.messageService.warn(`No custom keybinding found for '${command}'`);
            return false;
        }
        const dialog = new ConfirmDialog({
            title: `Revert keybinding for '${command}'`,
            msg: 'Do you really want to revert this keybinding?'
        });
        return !!await dialog.open();
    }

    protected async removeKeybinding(item: KeybindingItem): Promise<void> {
        const regexp = new RegExp(this.regexp);
        const rawCommandId = item.id.replace(regexp, '$1');
        const rawCommand = item.command.replace(regexp, '$1');
        const confirmed = await this.confirmRemoveKeybinding(rawCommand, rawCommandId);
        if (confirmed) {
            this.keymapsService.removeKeybinding(rawCommandId);
        }
    }

    protected validateKeybinding(command: string, keybinding: string): string {
        if (!keybinding) {
            return 'keybinding value is required';
        }
        try {
            const binding = { 'command': command, 'keybinding': keybinding };
            KeySequence.parse(keybinding);
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

    protected openKeybindings = () => this.keymapsService.open();

}
