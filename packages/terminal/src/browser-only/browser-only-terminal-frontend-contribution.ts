// *****************************************************************************
// Copyright (C) 2026 robertjndw
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { MessageService } from '@theia/core/lib/common/message-service';
import { nls } from '@theia/core/lib/common/nls';
import { ApplicationShell } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { TerminalFrontendContribution } from '../browser/terminal-frontend-contribution';
import { TerminalWidgetOptions, TerminalWidget } from '../browser/base/terminal-widget';
import { TerminalProfile } from '../browser/terminal-profile-service';

/**
 * A browser-only application has no backend to run a shell in, so it can't open terminals.
 *
 * `TerminalService`, `FrontendApplicationContribution`, `CommandContribution` and the other
 * contribution points in `terminal-frontend-module.ts` are all bound with
 * `toService(TerminalFrontendContribution)`, which resolves the token lazily on every lookup.
 * Rebinding `TerminalFrontendContribution` itself - instead of only `TerminalService` - therefore
 * redirects every one of those paths (UI commands, terminal profiles, and the `TerminalService`
 * token used by plugins/tasks/debug) through this subclass, rather than just the minority of
 * callers that happen to inject `TerminalService` directly.
 */
@injectable()
export class BrowserOnlyTerminalFrontendContribution extends TerminalFrontendContribution {

    @inject(MessageService)
    protected readonly messageService: MessageService;

    // There is no backend to restore or create a terminal for at startup, so skip it silently
    // instead of letting the base implementation fail and log an error on every launch.
    override async initializeLayout(): Promise<void> {
        // no terminal to restore in a browser-only application
    }

    // Callers that inject the `TerminalService` token programmatically (the VS Code
    // `window.createTerminal` API, tasks, debug sessions, AI terminal functions, ...) need a
    // rejected promise so they can handle the failure themselves. This message is not localized
    // since it is meant for those programmatic callers, not shown to the user directly.
    override async newTerminal(options: TerminalWidgetOptions): Promise<TerminalWidget> {
        throw new Error('Terminals are not supported in a browser-only application.');
    }

    // The plugin host queries the default shell on startup; report none available instead of
    // rejecting so that query doesn't fail plugin activation.
    override async getDefaultShell(): Promise<string> {
        return '';
    }

    override async openInTerminal(uri: URI): Promise<void> {
        this.showNotSupportedMessage();
    }

    protected override async openTerminal(options?: ApplicationShell.WidgetOptions, terminalProfile?: TerminalProfile): Promise<void> {
        this.showNotSupportedMessage();
    }

    protected override async openActiveWorkspaceTerminal(options?: ApplicationShell.WidgetOptions): Promise<void> {
        this.showNotSupportedMessage();
    }

    protected showNotSupportedMessage(): void {
        this.messageService.error(
            nls.localize('theia/terminal/notSupportedInBrowserOnly', 'Terminals are not supported in a browser-only application.')
        );
    }
}
