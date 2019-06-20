/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { inject, injectable, postConstruct } from 'inversify';
import {
    CommandContribution,
    Command,
    CommandRegistry,
    MenuContribution,
    MenuModelRegistry,
    isOSX,
    SelectionService,
    Emitter, Event
} from '@theia/core/lib/common';
import { QuickPickService } from '@theia/core/lib/common/quick-pick-service';
import {
    ApplicationShell, KeybindingContribution, KeyCode, Key,
    KeybindingRegistry, Widget, LabelProvider, WidgetOpenerOptions
} from '@theia/core/lib/browser';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { WidgetManager } from '@theia/core/lib/browser';
import { TERMINAL_WIDGET_FACTORY_ID, TerminalWidgetFactoryOptions } from './terminal-widget-impl';
import { TerminalKeybindingContexts } from './terminal-keybinding-contexts';
import { TerminalService } from './base/terminal-service';
import { TerminalWidgetOptions, TerminalWidget } from './base/terminal-widget';
import { UriAwareCommandHandler } from '@theia/core/lib/common/uri-command-handler';
import { FileSystem } from '@theia/filesystem/lib/common';
import URI from '@theia/core/lib/common/uri';
import { MAIN_MENU_BAR } from '@theia/core';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';

export namespace TerminalMenus {
    export const TERMINAL = [...MAIN_MENU_BAR, '7_terminal'];
    export const TERMINAL_NEW = [...TERMINAL, '1_terminal'];
    export const TERMINAL_TASKS = [...TERMINAL, '2_terminal'];
    export const TERMINAL_TASKS_INFO = [...TERMINAL_TASKS, '3_terminal'];
    export const TERMINAL_TASKS_CONFIG = [...TERMINAL_TASKS, '4_terminal'];
    export const TERMINAL_NAVIGATOR_CONTEXT_MENU = ['navigator-context-menu', 'navigation'];
}

export namespace TerminalCommands {
    const TERMINAL_CATEGORY = 'Terminal';
    export const NEW: Command = {
        id: 'terminal:new',
        category: TERMINAL_CATEGORY,
        label: 'Open New Terminal'
    };
    export const NEW_ACTIVE_WORKSPACE: Command = {
        id: 'terminal:new:active:workspace',
        category: TERMINAL_CATEGORY,
        label: 'Open New Terminal (In Active Workspace)'
    };
    export const TERMINAL_CLEAR: Command = {
        id: 'terminal:clear',
        category: TERMINAL_CATEGORY,
        label: 'Clear Terminal'
    };
    export const TERMINAL_CONTEXT: Command = {
        id: 'terminal:context',
        category: TERMINAL_CATEGORY,
        label: 'Open in Terminal'
    };
    export const SPLIT: Command = {
        id: 'terminal:split',
        category: TERMINAL_CATEGORY,
        label: 'Split Terminal'
    };
    /**
     * Command that displays all terminals that are currently opened
     */
    export const SHOW_ALL_OPENED_TERMINALS: Command = {
        id: 'workbench.action.showAllTerminals',
        category: 'View',
        label: 'Show All Opened Terminals'
    };
}

@injectable()
export class TerminalFrontendContribution implements TerminalService, CommandContribution, MenuContribution, KeybindingContribution, TabBarToolbarContribution {

    constructor(
        @inject(ApplicationShell) protected readonly shell: ApplicationShell,
        @inject(WidgetManager) protected readonly widgetManager: WidgetManager,
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(SelectionService) protected readonly selectionService: SelectionService
    ) { }

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(QuickPickService)
    protected readonly quickPick: QuickPickService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    protected readonly onDidCreateTerminalEmitter = new Emitter<TerminalWidget>();
    readonly onDidCreateTerminal: Event<TerminalWidget> = this.onDidCreateTerminalEmitter.event;

    protected readonly onDidChangeCurrentTerminalEmitter = new Emitter<TerminalWidget | undefined>();
    readonly onDidChangeCurrentTerminal: Event<TerminalWidget | undefined> = this.onDidCreateTerminalEmitter.event;

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    @postConstruct()
    protected init(): void {
        this.shell.currentChanged.connect(() => this.updateCurrentTerminal());
        this.widgetManager.onDidCreateWidget(({ widget }) => {
            if (widget instanceof TerminalWidget) {
                this.updateCurrentTerminal();
                this.onDidCreateTerminalEmitter.fire(widget);
            }
        });

        const terminalFocusKey = this.contextKeyService.createKey<boolean>('terminalFocus', false);
        const updateFocusKey = () => terminalFocusKey.set(this.shell.activeWidget instanceof TerminalWidget);
        updateFocusKey();
        this.shell.activeChanged.connect(updateFocusKey);
    }

    protected _currentTerminal: TerminalWidget | undefined;
    get currentTerminal(): TerminalWidget | undefined {
        return this._currentTerminal;
    }
    protected setCurrentTerminal(current: TerminalWidget | undefined): void {
        if (this._currentTerminal !== current) {
            this._currentTerminal = current;
            this.onDidChangeCurrentTerminalEmitter.fire(this._currentTerminal);
        }
    }
    protected updateCurrentTerminal(): void {
        const widget = this.shell.currentWidget;
        if (widget instanceof TerminalWidget) {
            this.setCurrentTerminal(widget);
        } else if (!this._currentTerminal || !this._currentTerminal.isVisible) {
            this.setCurrentTerminal(undefined);
        }
    }

    get all(): TerminalWidget[] {
        return this.widgetManager.getWidgets(TERMINAL_WIDGET_FACTORY_ID) as TerminalWidget[];
    }

    getById(id: string): TerminalWidget | undefined {
        return this.all.find(terminal => terminal.id === id);
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(TerminalCommands.NEW, {
            execute: () => this.openTerminal()
        });
        commands.registerCommand(TerminalCommands.NEW_ACTIVE_WORKSPACE, {
            execute: () => this.openActiveWorkspaceTerminal()
        });
        commands.registerCommand(TerminalCommands.SPLIT, {
            execute: widget => this.splitTerminal(widget),
            isEnabled: widget => !!this.getTerminalRef(widget),
            isVisible: widget => !!this.getTerminalRef(widget)
        });

        commands.registerCommand(TerminalCommands.TERMINAL_CLEAR);
        commands.registerHandler(TerminalCommands.TERMINAL_CLEAR.id, {
            isEnabled: () => this.shell.activeWidget instanceof TerminalWidget,
            execute: () => (this.shell.activeWidget as TerminalWidget).clearOutput()
        });

        commands.registerCommand(TerminalCommands.TERMINAL_CONTEXT, new UriAwareCommandHandler<URI>(this.selectionService, {
            execute: async uri => {
                // Determine folder path of URI
                const stat = await this.fileSystem.getFileStat(uri.toString());
                if (!stat) {
                    return;
                }

                // Use folder if a file was selected
                const cwd = (stat.isDirectory) ? uri.toString() : uri.parent.toString();

                // Open terminal
                const termWidget = await this.newTerminal({ cwd });
                termWidget.start();
                this.activateTerminal(termWidget);
            }
        }));
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerSubmenu(TerminalMenus.TERMINAL, 'Terminal');
        menus.registerMenuAction(TerminalMenus.TERMINAL_NEW, {
            commandId: TerminalCommands.NEW.id,
            label: 'New Terminal',
            order: '0'
        });
        menus.registerMenuAction(TerminalMenus.TERMINAL_NEW, {
            commandId: TerminalCommands.SPLIT.id,
            order: '1'
        });
        menus.registerMenuAction(TerminalMenus.TERMINAL_NAVIGATOR_CONTEXT_MENU, {
            commandId: TerminalCommands.TERMINAL_CONTEXT.id,
            order: 'z'
        });
    }

    registerToolbarItems(toolbar: TabBarToolbarRegistry): void {
        toolbar.registerItem({
            id: TerminalCommands.SPLIT.id,
            command: TerminalCommands.SPLIT.id,
            text: '$(columns)',
            tooltip: TerminalCommands.SPLIT.label
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: TerminalCommands.NEW.id,
            keybinding: 'ctrl+shift+`'
        });
        keybindings.registerKeybinding({
            command: TerminalCommands.NEW_ACTIVE_WORKSPACE.id,
            keybinding: 'ctrl+`'
        });
        keybindings.registerKeybinding({
            command: TerminalCommands.TERMINAL_CLEAR.id,
            keybinding: 'ctrlcmd+k',
            context: TerminalKeybindingContexts.terminalActive
        });

        /* Register passthrough keybindings for combinations recognized by
           xterm.js and converted to control characters.

             See: https://github.com/xtermjs/xterm.js/blob/v3/src/Terminal.ts#L1684 */

        /* Register ctrl + k (the passed Key) as a passthrough command in the
           context of the terminal.  */
        const regCtrl = (k: { keyCode: number, code: string }) => {
            keybindings.registerKeybinding({
                command: KeybindingRegistry.PASSTHROUGH_PSEUDO_COMMAND,
                keybinding: KeyCode.createKeyCode({ key: k, ctrl: true }).toString(),
                context: TerminalKeybindingContexts.terminalActive,
            });
        };

        /* Register alt + k (the passed Key) as a passthrough command in the
           context of the terminal.  */
        const regAlt = (k: { keyCode: number, code: string }) => {
            keybindings.registerKeybinding({
                command: KeybindingRegistry.PASSTHROUGH_PSEUDO_COMMAND,
                keybinding: KeyCode.createKeyCode({ key: k, alt: true }).toString(),
                context: TerminalKeybindingContexts.terminalActive
            });
        };

        /* ctrl-space (000 - NUL).  */
        regCtrl(Key.SPACE);

        /* ctrl-A (001/1/0x1) through ctrl-Z (032/26/0x1A).  */
        for (let i = 0; i < 26; i++) {
            regCtrl({
                keyCode: Key.KEY_A.keyCode + i,
                code: 'Key' + String.fromCharCode('A'.charCodeAt(0) + i)
            });
        }

        /* ctrl-[ or ctrl-3 (033/27/0x1B - ESC).  */
        regCtrl(Key.BRACKET_LEFT);
        regCtrl(Key.DIGIT3);

        /* ctrl-\ or ctrl-4 (034/28/0x1C - FS).  */
        regCtrl(Key.BACKSLASH);
        regCtrl(Key.DIGIT4);

        /* ctrl-] or ctrl-5 (035/29/0x1D - GS).  */
        regCtrl(Key.BRACKET_RIGHT);
        regCtrl(Key.DIGIT5);

        /* ctrl-6 (036/30/0x1E - RS).  */
        regCtrl(Key.DIGIT6);

        /* ctrl-7 (037/31/0x1F - US).  */
        regCtrl(Key.DIGIT7);

        /* ctrl-8 (177/127/0x7F - DEL).  */
        regCtrl(Key.DIGIT8);

        /* alt-A (0x1B 0x62) through alt-Z (0x1B 0x7A).  */
        for (let i = 0; i < 26; i++) {
            regAlt({
                keyCode: Key.KEY_A.keyCode + i,
                code: 'Key' + String.fromCharCode('A'.charCodeAt(0) + i)
            });
        }

        /* alt-` (0x1B 0x60).  */
        regAlt(Key.BACKQUOTE);

        /* alt-0 (0x1B 0x30) through alt-9 (0x1B 0x39).  */
        for (let i = 0; i < 10; i++) {
            regAlt({
                keyCode: Key.DIGIT0.keyCode + i,
                code: 'Digit' + String.fromCharCode('0'.charCodeAt(0) + i)
            });
        }
        if (isOSX) {
            // selectAll on OSX
            keybindings.registerKeybinding({
                command: KeybindingRegistry.PASSTHROUGH_PSEUDO_COMMAND,
                keybinding: 'ctrlcmd+a',
                context: TerminalKeybindingContexts.terminalActive
            });
        }
    }

    async newTerminal(options: TerminalWidgetOptions): Promise<TerminalWidget> {
        const widget = <TerminalWidget>await this.widgetManager.getOrCreateWidget(TERMINAL_WIDGET_FACTORY_ID, <TerminalWidgetFactoryOptions>{
            created: new Date().toString(),
            ...options
        });
        return widget;
    }

    activateTerminal(widget: TerminalWidget, widgetOptions?: ApplicationShell.WidgetOptions): void {
        this.open(widget, { widgetOptions });
    }

    // TODO: reuse WidgetOpenHandler.open
    open(widget: TerminalWidget, options?: WidgetOpenerOptions): void {
        const op: WidgetOpenerOptions = {
            mode: 'activate',
            ...options,
            widgetOptions: {
                area: 'bottom',
                ...(options && options.widgetOptions)
            }
        };
        if (!widget.isAttached) {
            this.shell.addWidget(widget, op.widgetOptions);
        }
        if (op.mode === 'activate') {
            this.shell.activateWidget(widget.id);
        } else if (op.mode === 'reveal') {
            this.shell.revealWidget(widget.id);
        }
    }

    protected async selectTerminalCwd(): Promise<string | undefined> {
        const roots = this.workspaceService.tryGetRoots();
        return this.quickPick.show(roots.map(
            ({ uri }) => ({ label: this.labelProvider.getLongName(new URI(uri)), value: uri })
        ), { placeholder: 'Select current working directory for new terminal' });
    }

    protected async splitTerminal(widget?: Widget): Promise<void> {
        const ref = this.getTerminalRef(widget);
        if (ref) {
            await this.openTerminal({ ref, mode: 'split-right' });
        }
    }

    protected getTerminalRef(widget?: Widget): TerminalWidget | undefined {
        const ref = widget ? widget : this.shell.currentWidget;
        return ref instanceof TerminalWidget ? ref : undefined;
    }

    protected async openTerminal(options?: ApplicationShell.WidgetOptions): Promise<void> {
        const cwd = await this.selectTerminalCwd();
        const termWidget = await this.newTerminal({ cwd });
        termWidget.start();
        this.open(termWidget, { widgetOptions: options });
    }

    protected async openActiveWorkspaceTerminal(options?: ApplicationShell.WidgetOptions): Promise<void> {
        const termWidget = await this.newTerminal({});
        termWidget.start();
        this.open(termWidget, { widgetOptions: options });
    }
}
