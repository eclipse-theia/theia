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

    constructor(
        @inject(CommandRegistry) protected readonly commands: CommandRegistry,
        @inject(KeybindingRegistry) protected readonly keybindings: KeybindingRegistry,
        @inject(QuickOpenService) protected readonly quickOpenService: QuickOpenService
    ) { }

    open(): void {
        this.quickOpenService.open(this, {
            placeholder: 'Type the name of a command you want to execute',
            fuzzyMatchLabel: true,
            fuzzySort: true
        });
    }

    public getItems(lookFor: string): QuickOpenItem[] {
        const items = [];
        for (const command of this.commands.commands) {
            if (command.label) {
                items.push(new CommandQuickOpenItem(command, this.commands, this.keybindings));
            }
        }
        return items;
    }

}

export class CommandQuickOpenItem extends QuickOpenItem {
    constructor(
        protected readonly command: Command,
        protected readonly commands: CommandRegistry,
        protected readonly keybindings: KeybindingRegistry
    ) {
        super();
    }

    getLabel(): string {
        return this.command.label!;
    }

    isHidden(): boolean {
        return super.isHidden() || !this.commands.getActiveHandler(this.command.id);
    }

    getKeybinding(): Keybinding | undefined {
        return this.keybindings.getKeybindingForCommand(this.command.id);
    }

    run(mode: QuickOpenMode): boolean {
        if (mode !== QuickOpenMode.OPEN) {
            return false;
        }
        this.commands.executeCommand(this.command.id);
        return true;
    }
}
