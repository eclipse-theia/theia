// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
import { CommandRegistry, MenuModelRegistry } from '@theia/core';
import { AbstractViewContribution, CommonMenus, KeybindingRegistry, PreferenceService, Widget } from '@theia/core/lib/browser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { AIActivationService, EXPERIMENTAL_AI_CONTEXT_KEY } from './ai-activation-service';
import { AICommandHandlerFactory } from './ai-command-handler-factory';

@injectable()
export class AIViewContribution<T extends Widget> extends AbstractViewContribution<T> {

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(AIActivationService)
    protected readonly activationService: AIActivationService;

    @inject(AICommandHandlerFactory)
    protected readonly commandHandlerFactory: AICommandHandlerFactory;

    @postConstruct()
    protected init(): void {
        this.activationService.onDidChangeActiveStatus(active => {
            if (!active) {
                this.closeView();
            }
        });
    }

    override registerCommands(commands: CommandRegistry): void {
        if (this.toggleCommand) {

            commands.registerCommand(this.toggleCommand, this.commandHandlerFactory({
                execute: () => this.toggleView(),
            }));
        }
        this.quickView?.registerItem({
            label: this.viewLabel,
            when: EXPERIMENTAL_AI_CONTEXT_KEY,
            open: () => this.openView({ activate: true })
        });

    }

    override registerMenus(menus: MenuModelRegistry): void {
        if (this.toggleCommand) {
            menus.registerMenuAction(CommonMenus.VIEW_VIEWS, {
                commandId: this.toggleCommand.id,
                when: EXPERIMENTAL_AI_CONTEXT_KEY,
                label: this.viewLabel
            });
        }
    }
    override registerKeybindings(keybindings: KeybindingRegistry): void {
        if (this.toggleCommand && this.options.toggleKeybinding) {
            keybindings.registerKeybinding({
                command: this.toggleCommand.id,
                when: EXPERIMENTAL_AI_CONTEXT_KEY,
                keybinding: this.options.toggleKeybinding
            });
        }
    }
}

