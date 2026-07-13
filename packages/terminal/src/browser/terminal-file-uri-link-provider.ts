// *****************************************************************************
// Copyright (C) 2026 JuliaHub, Inc. and others.
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

import { ILogger } from '@theia/core';
import { OpenerService } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { TerminalWidget } from './base/terminal-widget';
import { TerminalLink, TerminalLinkProvider } from './terminal-link-provider';

/**
 * Linkifies `file://` URLs printed in the terminal and opens the referenced local file in the editor.
 *
 * `UrlLinkProvider` only matches `http(s)`, and `FileLinkProvider`'s path regex excludes `:`, so a
 * printed `file://` URL survives there only as a scheme-less remainder that its guard skips. A `file:`
 * URL carries its authority in the string itself, so it is parsed as a whole rather than reconstructed
 * from a path against the terminal's cwd.
 */
@injectable()
export class FileUriLinkProvider implements TerminalLinkProvider {

    @inject(OpenerService) protected readonly openerService: OpenerService;
    @inject(FileService) protected readonly fileService: FileService;
    @inject(ILogger) @named('terminal:FileUriLinkProvider')
    protected readonly logger: ILogger;

    // 'file://' followed by an optional third slash (empty authority) and the authority/path remainder,
    // stopping at whitespace and characters that commonly delimit a URL in prose.
    protected readonly fileUriRegExp = /file:\/\/\/?[^\s'"`<>()[\]]+/g;

    async provideLinks(line: string, terminal: TerminalWidget): Promise<TerminalLink[]> {
        const links: TerminalLink[] = [];
        this.fileUriRegExp.lastIndex = 0;
        let regExpResult: RegExpExecArray | null;
        while (regExpResult = this.fileUriRegExp.exec(line)) {
            const match = this.trimTrailingPunctuation(regExpResult[0]);
            const uri = this.toURI(match);
            if (uri && await this.isValidFileURI(uri)) {
                links.push({
                    startIndex: regExpResult.index,
                    length: match.length,
                    handle: () => this.open(uri)
                });
            }
        }
        return links;
    }

    protected toURI(match: string): URI | undefined {
        try {
            const uri = new URI(match);
            return uri.scheme === 'file' ? uri : undefined;
        } catch {
            return undefined;
        }
    }

    protected async isValidFileURI(uri: URI): Promise<boolean> {
        try {
            const stat = await this.fileService.resolve(uri);
            return !stat.isDirectory;
        } catch { }
        return false;
    }

    protected async open(uri: URI): Promise<void> {
        try {
            const opener = await this.openerService.getOpener(uri);
            await opener.open(uri);
        } catch (err) {
            this.logger.error('Cannot open link ' + uri, err);
        }
    }

    protected trimTrailingPunctuation(match: string): string {
        return match.replace(/[.,;:]+$/, '');
    }
}
