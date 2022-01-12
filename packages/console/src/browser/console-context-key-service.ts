/********************************************************************************
 * Copyright (C) 2022 Ericsson and others.
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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ContextKeyService, ContextKey } from '@theia/core/lib/browser/context-key-service';
import { ConsoleManager } from './console-manager';

export namespace ConsoleContextKeys {
    /**
     * ID of a keybinding context that is enabled when the console content has the focus.
     */
    export const CONSOLE_CONTENT_FOCUS = 'consoleContentFocus';
    /**
     * ID of a keybinding context that is enabled when the console input has the focus.
     */
    export const CONSOLE_INPUT_FOCUS = 'consoleInputFocus';
    /**
     * ID of a keybinding context that is enabled when the console history navigation back is enabled.
     */
    export const CONSOLE_NAVIGATION_BACK_ENABLED = 'consoleNavigationBackEnabled';

    /**
     * ID of a keybinding context that is enabled when the console history navigation forward is enabled.
     */
    export const CONSOLE_NAVIGATOR_FORWARD_ENABLED = 'consoleNavigationForwardEnabled';
}

@injectable()
export class ConsoleContextKeyService {

    @inject(ConsoleManager)
    protected consoleManager: ConsoleManager;

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    protected _consoleContentFocus: ContextKey<boolean>;
    get consoleContextFocus(): ContextKey<boolean> {
        return this._consoleContentFocus;
    }

    protected _consoleInputFocus: ContextKey<boolean>;
    get consoleInputFocus(): ContextKey<boolean> {
        return this._consoleInputFocus;
    }

    protected _consoleNavigationBackEnabled: ContextKey<boolean>;
    get consoleNavigationBackEnabled(): ContextKey<boolean> {
        return this._consoleNavigationBackEnabled;
    }

    protected _consoleNavigationForwardEnabled: ContextKey<boolean>;
    get consoleNavigationForwardEnabled(): ContextKey<boolean> {
        return this._consoleNavigationForwardEnabled;
    }

    @postConstruct()
    protected init(): void {
        this._consoleContentFocus = this.contextKeyService.createKey<boolean>(ConsoleContextKeys.CONSOLE_CONTENT_FOCUS, false);
        this._consoleInputFocus = this.contextKeyService.createKey<boolean>(ConsoleContextKeys.CONSOLE_INPUT_FOCUS, false);
        this._consoleNavigationBackEnabled = this.contextKeyService.createKey<boolean>(ConsoleContextKeys.CONSOLE_NAVIGATION_BACK_ENABLED, false);
        this._consoleNavigationForwardEnabled = this.contextKeyService.createKey<boolean>(ConsoleContextKeys.CONSOLE_NAVIGATOR_FORWARD_ENABLED, false);
    }

}
