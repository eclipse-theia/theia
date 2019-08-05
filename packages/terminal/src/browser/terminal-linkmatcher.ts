/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { injectable, inject } from 'inversify';
import { isOSX, } from '@theia/core';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { TerminalContribution } from './terminal-contribution';
import { TerminalWidgetImpl } from './terminal-widget-impl';

@injectable()
export abstract class AbstractCmdClickTerminalContribution implements TerminalContribution {

    abstract getRegExp(terminalWidget: TerminalWidgetImpl): Promise<RegExp>;
    abstract getHandler(terminalWidget: TerminalWidgetImpl): (event: MouseEvent, text: string) => void;
    getValidate(terminalWidget: TerminalWidgetImpl): (text: string) => Promise<boolean> {
        return () => Promise.resolve(true);
    }

    async onCreate(terminalWidget: TerminalWidgetImpl): Promise<void> {
        const term = terminalWidget.getTerminal();
        const regexp = await this.getRegExp(terminalWidget);
        const handler = this.getHandler(terminalWidget);
        const validate = this.getValidate(terminalWidget);
        const wrappedHandler = (event: MouseEvent, match: string) => {
            event.preventDefault();
            if (this.isCommandPressed(event)) {
                handler(event, match);
            } else {
                term.focus();
            }
        };
        const matcherId = term.registerLinkMatcher(regexp, wrappedHandler, {
            willLinkActivate: (event: MouseEvent, uri: string) => this.isCommandPressed(event),
            tooltipCallback: (event: MouseEvent, uri: string) => {
                terminalWidget.showHoverMessage(event.clientX, event.clientY, this.getHoverMessage());
            },
            leaveCallback: (event: MouseEvent, uri: string) => {
                terminalWidget.hideHover();
            },
            validationCallback: async (uri: string, callBack: (isValid: boolean) => void) => {
                callBack(await validate(uri));
            }
        });
        terminalWidget.onDispose(() => {
            term.deregisterLinkMatcher(matcherId);
        });
    }

    protected isCommandPressed(event: MouseEvent): boolean {
        return isOSX ? event.metaKey : event.ctrlKey;
    }

    protected getHoverMessage(): string {
        if (isOSX) {
            return 'Cmd + click to follow link';
        } else {
            return 'Ctrl + click to follow link';
        }
    }

}

@injectable()
export class URLMatcher extends AbstractCmdClickTerminalContribution {

    @inject(WindowService)
    protected readonly windowService: WindowService;

    async getRegExp(): Promise<RegExp> {
        return /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,4}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/;
    }

    getHandler(): (event: MouseEvent, uri: string) => void {
        return (event: MouseEvent, uri: string) => {
            this.windowService.openNewWindow(uri);
        };
    }
}

@injectable()
export class LocalhostMatcher extends AbstractCmdClickTerminalContribution {

    @inject(WindowService)
    protected readonly windowService: WindowService;

    async getRegExp(): Promise<RegExp> {
        return /(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0)(:[0-9]{1,5})?([-a-zA-Z0-9@:%_\+.~#?&//=]*)/;
    }

    getHandler(): (event: MouseEvent, uri: string) => void {
        return (event: MouseEvent, matched: string) => {
            const uri = matched.startsWith('http') ? matched : `http://${matched}`;
            this.windowService.openNewWindow(uri);
        };
    }
}
