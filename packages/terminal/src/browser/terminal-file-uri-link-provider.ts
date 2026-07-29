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
import URI from '@theia/core/lib/common/uri';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { Position } from '@theia/editor/lib/browser';
import { AbstractFileOpeningLinkProvider } from './terminal-file-opening-link-provider';
import { TerminalWidget } from './base/terminal-widget';
import { TerminalLink } from './terminal-link-provider';

/**
 * Linkifies `file://` URLs printed in the terminal and opens the referenced local file in the editor.
 *
 * A dedicated provider is needed because `UrlLinkProvider` only matches `http(s)` and
 * `FileLinkProvider`'s path regex excludes `:`, so neither recognizes the `file:` scheme.
 */
@injectable()
export class FileUriLinkProvider extends AbstractFileOpeningLinkProvider {

    @inject(ILogger) @named('terminal:FileUriLinkProvider')
    protected readonly logger: ILogger;

    // The optional third slash denotes an empty authority (`file:///path`); the match runs to the first
    // whitespace or character that commonly delimits a URL in prose.
    protected readonly fileUriRegExp = /file:\/\/\/?[^\s'"`<>()[\]]+/g;

    async provideLinks(line: string, terminal: TerminalWidget): Promise<TerminalLink[]> {
        // Collect all matches synchronously before awaiting: the `g`-flag regex is instance-shared, so
        // yielding mid-iteration would let a concurrent call corrupt its `lastIndex`.
        const candidates: Array<{ match: string, startIndex: number }> = [];
        this.fileUriRegExp.lastIndex = 0;
        let regExpResult: RegExpExecArray | null;
        while (regExpResult = this.fileUriRegExp.exec(line)) {
            candidates.push({ match: this.trimTrailingPunctuation(regExpResult[0]), startIndex: regExpResult.index });
        }
        const links = await Promise.all(candidates.map(async ({ match, startIndex }) => {
            const { fileUri, position } = this.splitPosition(match);
            const uri = this.toURI(fileUri);
            if (uri && await this.isValidFileURI(uri)) {
                return { startIndex, length: match.length, handle: () => this.openURI(uri, position) };
            }
            return undefined;
        }));
        return links.filter((link): link is TerminalLink => link !== undefined);
    }

    /**
     * Splits a trailing `:line` or `:line:column` suffix (as in `file:///x.ts:10:5`) off the matched
     * URL into a one-based editor position. The drive colon of `file:///C:/x.ts` is not affected, as
     * it is not followed by digits at the end of the string.
     */
    protected splitPosition(match: string): { fileUri: string, position?: Position } {
        const positionMatch = /:(\d+)(?::(\d+))?$/.exec(match);
        if (!positionMatch) {
            return { fileUri: match };
        }
        const line = Math.max(0, parseInt(positionMatch[1], 10) - 1);
        const character = positionMatch[2] !== undefined ? Math.max(0, parseInt(positionMatch[2], 10) - 1) : 0;
        return {
            fileUri: match.slice(0, positionMatch.index),
            position: { line, character }
        };
    }

    protected toURI(match: string): URI | undefined {
        try {
            const uri = new URI(match);
            return uri.scheme === 'file' ? uri : undefined;
        } catch {
            return undefined;
        }
    }

    protected trimTrailingPunctuation(match: string): string {
        return match.replace(/[.,;:]+$/, '');
    }
}
