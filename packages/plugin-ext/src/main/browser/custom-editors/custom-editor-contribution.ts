// *****************************************************************************
// Copyright (C) 2021 SAP SE or an SAP affiliate company and others.
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

import { injectable, inject } from '@theia/core/shared/inversify';
import { CommandRegistry, CommandContribution } from '@theia/core/lib/common';
import { ApplicationShell, CommonCommands } from '@theia/core/lib/browser';
import { CustomEditorWidget } from './custom-editor-widget';

@injectable()
export class CustomEditorContribution implements CommandContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    registerCommands(commands: CommandRegistry): void {
        commands.registerHandler(CommonCommands.UNDO.id, {
            isEnabled: () => this.shell.activeWidget instanceof CustomEditorWidget,
            execute: () => (this.shell.activeWidget as CustomEditorWidget).undo()
        });
        commands.registerHandler(CommonCommands.REDO.id, {
            isEnabled: () => this.shell.activeWidget instanceof CustomEditorWidget,
            execute: () => (this.shell.activeWidget as CustomEditorWidget).redo()
        });
    }
}
