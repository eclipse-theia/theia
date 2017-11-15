/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from "inversify";
import { Command, CommandRegistry, Keybinding, KeybindingRegistry } from '../../common';
import { QuickOpenModel, QuickOpenItem, QuickOpenMode } from './quick-open-model';
import { QuickOpenService } from "./quick-open-service";

@injectable()
export class QuickCommandService implements QuickOpenModel {

    private items: QuickOpenItem[];

    constructor(
        @inject(CommandRegistry) protected readonly commands: CommandRegistry,
        @inject(KeybindingRegistry) protected readonly keybindings: KeybindingRegistry,
        @inject(QuickOpenService) protected readonly quickOpenService: QuickOpenService
    ) { }

    open(): void {
        // let's compute the items here to do it in the context of the currently activeElement
        this.items = [];
        const filteredAndSortedCommands = this.commands.commands.filter(a => a.label).sort((a, b) => a.label!.localeCompare(b.label!));
        for (const command of filteredAndSortedCommands) {
            if (command.label) {
                this.items.push(new CommandQuickOpenItem(command, this.commands, this.keybindings));
            }
        }

        this.quickOpenService.open(this, {
            placeholder: 'Type the name of a command you want to execute',
            fuzzyMatchLabel: true,
            fuzzySort: false
        });
    }

    public onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): void {
        acceptor(this.items);
    }

}

export class CommandQuickOpenItem extends QuickOpenItem {

    private activeElement: HTMLElement;
    private hidden: boolean;

    constructor(
        protected readonly command: Command,
        protected readonly commands: CommandRegistry,
        protected readonly keybindings: KeybindingRegistry
    ) {
        super();
        this.activeElement = window.document.activeElement as HTMLElement;
        this.hidden = !this.commands.getActiveHandler(this.command.id);
    }

    getLabel(): string {
        return this.command.label!;
    }

    isHidden(): boolean {
        return this.hidden;
    }

    getKeybinding(): Keybinding | undefined {
        const bindings = this.keybindings.getKeybindingsForCommand(this.command.id);
        return bindings ? bindings[0] : undefined;
    }

    run(mode: QuickOpenMode): boolean {
        if (mode !== QuickOpenMode.OPEN) {
            return false;
        }
        // allow the quick open widget to close itself
        setTimeout(() => {
            // reset focus on the previously active element.
            this.activeElement.focus();
            this.commands.executeCommand(this.command.id);
        }, 50);
        return true;
    }
}
