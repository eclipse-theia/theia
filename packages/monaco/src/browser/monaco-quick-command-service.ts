/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { Command, CommandRegistry, KeybindingRegistry } from '@theia/core';

@injectable()
export class MonacoQuickCommandService {

    protected readonly container: HTMLElement;
    protected widget: monaco.quickOpen.QuickOpenWidget | undefined;

    constructor(
        @inject(CommandRegistry) protected readonly commands: CommandRegistry,
        @inject(KeybindingRegistry) protected readonly keybindings: KeybindingRegistry
    ) {
        const overlayWidgets = document.createElement('div');
        overlayWidgets.classList.add('overlayWidgets');
        document.body.appendChild(overlayWidgets);

        const container = document.createElement('quick-open-container');
        container.style.position = 'absolute';
        container.style.top = '0px';
        container.style.right = '50%';
        overlayWidgets.appendChild(container);
        this.container = container;
    }

    show(prefix: string = ''): void {
        if (this.widget) {
            this.widget.dispose();
        }
        const widget = this.widget = new monaco.quickOpen.QuickOpenWidget(this.container, {
            onOk: () => { /*no-op*/ },
            onCancel: () => { /*no-op*/ },
            onType: (lookFor: string) => {
                const entries = this.commands.commands.reduce((result, command) => {
                    const entry = this.createEntry(command, lookFor);
                    if (entry) {
                        result.push(entry);
                    }
                    return result;
                }, [] as CommandQuickOpenEntry[]);
                entries.sort((a, b) => monaco.quickOpen.QuickOpenEntry.compare(a, b, lookFor));
                const model = new monaco.quickOpen.QuickOpenModel(entries);
                widget.setInput(model, {
                    autoFocusFirstEntry: true,
                    autoFocusPrefixMatch: lookFor
                });
            },
            onFocusLost: () => false
        }, { inputPlaceHolder: "Type the name of a command you want to execute" });
        this.widget.create();
        this.widget.show(prefix);
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
