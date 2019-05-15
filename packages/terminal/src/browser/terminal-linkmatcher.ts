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

import { ILinkMatcherOptions } from 'xterm';
import { injectable, inject } from 'inversify';
import { MaybePromise, } from '@theia/core';
import { WindowService } from '@theia/core/lib/browser/window/window-service';

export const ITerminalLinkMatcher = Symbol('ITerminalLinkMatcher');

export interface ITerminalLinkMatcher {
    getRegex(): MaybePromise<RegExp>;
    readonly options?: ILinkMatcherOptions;
    handler(event: MouseEvent, uri: string): void;
}

@injectable()
export class URLMatcher implements ITerminalLinkMatcher {

    @inject(WindowService)
    protected readonly windowService: WindowService;

    getRegex() { return /(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,4}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/; }

    handler = (event: MouseEvent, uri: string) => {
        this.windowService.openNewWindow(uri);
    }
}

@injectable()
export class LocalhostMatcher implements ITerminalLinkMatcher {

    @inject(WindowService)
    protected readonly windowService: WindowService;

    getRegex() { return /(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0)(:[0-9]{1,5})?([-a-zA-Z0-9@:%_\+.~#?&//=]*)/; }

    handler = (event: MouseEvent, matched: string) => {
        const uri = matched.startsWith('http') ? matched : `http://${matched}`;
        this.windowService.openNewWindow(uri);
    }
}
