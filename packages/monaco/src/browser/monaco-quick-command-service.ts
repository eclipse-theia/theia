/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { Command, CommandRegistry, KeybindingRegistry } from '@theia/core';
import { MonacoQuickOpenService } from './monaco-quick-open-service';

@injectable()
export class MonacoQuickCommandService implements monaco.quickOpen.IQuickOpenControllerOpts {

    readonly inputAriaLabel: 'Type the name of a command you want to execute';

    constructor(
        @inject(CommandRegistry) protected readonly commands: CommandRegistry,
        @inject(KeybindingRegistry) protected readonly keybindings: KeybindingRegistry,
        @inject(MonacoQuickOpenService) protected readonly quickOpenService: MonacoQuickOpenService
    ) { }

    open(): void {
        this.quickOpenService.open(this);
    }

    getModel(lookFor: string): monaco.quickOpen.QuickOpenModel {
        const entries = this.commands.commands.reduce((result, command) => {
            const entry = this.createEntry(command, lookFor);
            if (entry) {
                result.push(entry);
            }
            return result;
        }, [] as CommandQuickOpenEntry[]);
        entries.sort((a, b) => monaco.quickOpen.QuickOpenEntry.compare(a, b, lookFor));
        return new monaco.quickOpen.QuickOpenModel(entries);
    }

    getAutoFocus(lookFor: string): monaco.quickOpen.IAutoFocus {
        return {
            autoFocusFirstEntry: true,
            autoFocusPrefixMatch: lookFor
        };
    }

    protected createEntry(command: Command, lookFor: string): CommandQuickOpenEntry | undefined {
        if (!command.label) {
            return undefined;
        }
        if (!lookFor) {
            return new CommandQuickOpenEntry(command, this.commands, this.keybindings);
        }
        const labelHighlights = monaco.filters.matchesFuzzy(lookFor, command.label);
        if (!labelHighlights) {
            return undefined;
        }
        const entry = new CommandQuickOpenEntry(command, this.commands, this.keybindings);
        entry.setHighlights(labelHighlights, [], []);
        return entry;
    }
}

export class CommandQuickOpenEntry extends monaco.quickOpen.QuickOpenEntry {
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

    run(mode: monaco.quickOpen.Mode): boolean {
        if (mode !== monaco.quickOpen.Mode.OPEN) {
            return false;
        }
        this.commands.executeCommand(this.command.id);
        return true;
    }
}
