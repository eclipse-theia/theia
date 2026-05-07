// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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

import * as React from '@theia/core/shared/react';
import { inject, postConstruct, injectable } from '@theia/core/shared/inversify';
import { CommandMenu, CompoundMenuNode, MenuModelRegistry, MenuPath } from '@theia/core';
import { KeybindingRegistry } from '@theia/core/lib/browser';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { ReactWidget } from '@theia/core/lib/browser/widgets';
import { DebugViewModel } from './debug-view-model';
import { DebugAction } from './debug-action';

@injectable()
export class DebugToolBar extends ReactWidget {

    static readonly MENU: MenuPath = ['debug-toolbar-menu'];
    static readonly CONTROLS: MenuPath = [...DebugToolBar.MENU, 'z_controls'];

    @inject(MenuModelRegistry) protected readonly menuModelRegistry: MenuModelRegistry;
    @inject(KeybindingRegistry) protected readonly keybindingRegistry: KeybindingRegistry;
    @inject(ContextKeyService) protected readonly contextKeyService: ContextKeyService;
    @inject(DebugViewModel) protected readonly model: DebugViewModel;

    @postConstruct()
    protected init(): void {
        this.id = 'debug:toolbar:' + this.model.id;
        this.addClass('debug-toolbar');
        this.toDispose.push(this.model);
        this.toDispose.push(this.model.onDidChange(() => this.update()));
        this.toDispose.push(this.keybindingRegistry.onKeybindingsChanged(() => this.update()));
        this.scrollOptions = undefined;
        this.update();
    }

    protected render(): React.ReactNode {
        return <React.Fragment>
            {this.renderContributedCommands()}
        </React.Fragment>;
    }

    protected renderContributedCommands(): React.ReactNode {
        const debugActions: React.ReactNode[] = [];
        // first, search for CompoundMenuNodes:
        this.menuModelRegistry.getMenu(DebugToolBar.MENU)!.children.forEach(compoundMenuNode => {
            if (CompoundMenuNode.is(compoundMenuNode) && compoundMenuNode.isVisible(DebugToolBar.MENU, this.contextKeyService, this.node)) {
                // second, search for nested CommandMenuNodes:
                compoundMenuNode.children.forEach(commandMenuNode => {
                    if (CommandMenu.is(commandMenuNode) && commandMenuNode.isVisible(DebugToolBar.MENU, this.contextKeyService, this.node)) {
                        debugActions.push(this.debugAction(commandMenuNode));
                    }
                });
            }
        });
        return debugActions;
    }

    protected debugAction(commandMenuNode: CommandMenu): React.ReactNode {
        const accelerator = this.acceleratorFor(commandMenuNode.id);
        const run = (effectiveMenuPath: MenuPath) => commandMenuNode.run(effectiveMenuPath).catch(e => console.error(e));
        return <DebugAction
            key={commandMenuNode.id}
            enabled={commandMenuNode.isEnabled(DebugToolBar.MENU)}
            label={commandMenuNode.label}
            tooltip={commandMenuNode.label + (accelerator ? ` (${accelerator})` : '')}
            iconClass={commandMenuNode.icon || ''}
            run={run} />;
    }

    protected acceleratorFor(commandId: string): string | undefined {
        const keybindings = this.keybindingRegistry.getKeybindingsForCommand(commandId);
        return keybindings.length ? this.keybindingRegistry.acceleratorFor(keybindings[0], '+').join(' ') : undefined;
    }

}
