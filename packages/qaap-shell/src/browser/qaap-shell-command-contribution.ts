// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { CommandContribution, CommandRegistry, CommandHandler } from '@theia/core/lib/common/command';
import { CommonCommands } from '@theia/core/lib/browser/common-commands';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';

/** Adds `isToggled` for the bottom panel toggle (upstream command omits it). */
@injectable()
export class QaapShellCommandContribution implements CommandContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    registerCommands(_registry: CommandRegistry): void {
        /* command registered in CommonFrontendContribution */
    }

    registerHandlers(registry: CommandRegistry): void {
        const handler: CommandHandler = {
            isEnabled: () => false,
            isToggled: () => this.shell.isExpanded('bottom'),
            execute: () => undefined
        };
        registry.registerHandler(CommonCommands.TOGGLE_BOTTOM_PANEL.id, handler);
    }
}
