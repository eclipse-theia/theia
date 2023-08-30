// *****************************************************************************
// Copyright (C) 2022 STMicroelectronics and others.
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
import { OpenerService, open } from '@theia/core/lib/browser';
import { TerminalWidget } from './base/terminal-widget';
import { TerminalLink, TerminalLinkProvider } from './terminal-link-provider';
import URI from '@theia/core/lib/common/uri';

@injectable()
export class UrlLinkProvider implements TerminalLinkProvider {

    @inject(OpenerService) protected readonly openerService: OpenerService;

    protected readonly urlRegExp = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,4}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/g;
    protected readonly localhostRegExp = /(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0)(:[0-9]{1,5})?([-a-zA-Z0-9@:%_\+.~#?&//=]*)/g;

    async provideLinks(line: string, terminal: TerminalWidget): Promise<TerminalLink[]> {
        return [...this.matchUrlLinks(line), ...this.matchLocalhostLinks(line)];
    }

    protected matchUrlLinks(line: string): TerminalLink[] {
        const links: TerminalLink[] = [];
        let regExpResult: RegExpExecArray | null;
        while (regExpResult = this.urlRegExp.exec(line)) {
            const match = regExpResult![0];
            links.push({
                startIndex: this.urlRegExp.lastIndex - match.length,
                length: match.length,
                handle: () => open(this.openerService, new URI(match)).then()
            });
        }
        return links;
    }

    protected matchLocalhostLinks(line: string): TerminalLink[] {
        const links: TerminalLink[] = [];
        let regExpResult: RegExpExecArray | null;
        while (regExpResult = this.localhostRegExp.exec(line)) {
            const match = regExpResult![0];
            links.push({
                startIndex: this.localhostRegExp.lastIndex - match.length,
                length: match.length,
                handle: async () => {
                    const uri = match.startsWith('http') ? match : `http://${match}`;
                    open(this.openerService, new URI(uri));
                }
            });
        }
        return links;
    }

}
