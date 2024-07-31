// *****************************************************************************
// Copyright (C) 2019 TypeFox and others.
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

import { OS, Path, QuickInputService } from '@theia/core';
import { OpenerService } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { inject, injectable } from '@theia/core/shared/inversify';
import { Position } from '@theia/editor/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { TerminalWidget } from './base/terminal-widget';
import { TerminalLink, TerminalLinkProvider } from './terminal-link-provider';
import { TerminalWidgetImpl } from './terminal-widget-impl';
import { FileSearchService } from '@theia/file-search/lib/common/file-search-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
@injectable()
export class FileLinkProvider implements TerminalLinkProvider {

    @inject(OpenerService) protected readonly openerService: OpenerService;
    @inject(QuickInputService) protected readonly quickInputService: QuickInputService;
    @inject(FileService) protected fileService: FileService;
    @inject(FileSearchService) protected searchService: FileSearchService;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;

    async provideLinks(line: string, terminal: TerminalWidget): Promise<TerminalLink[]> {
        const links: TerminalLink[] = [];
        const regExp = await this.createRegExp();
        let regExpResult: RegExpExecArray | null;
        while (regExpResult = regExp.exec(line)) {
            const match = regExpResult[0];
            if (await this.isValidFile(match, terminal)) {
                links.push({
                    startIndex: regExp.lastIndex - match.length,
                    length: match.length,
                    handle: () => this.open(match, terminal)
                });
            }
        }
        return links;
    }

    protected async createRegExp(): Promise<RegExp> {
        const baseLocalLinkClause = OS.backend.isWindows ? winLocalLinkClause : unixLocalLinkClause;
        return new RegExp(`${baseLocalLinkClause}(${lineAndColumnClause})`, 'g');
    }

    protected async isValidFile(match: string, terminal: TerminalWidget): Promise<boolean> {
        try {
            const toOpen = await this.toURI(match, await this.getCwd(terminal));
            if (toOpen) {
                // TODO: would be better to ask the opener service, but it returns positively even for unknown files.
                return this.isValidFileURI(toOpen);
            }
        } catch (err) {
            console.trace('Error validating ' + match, err);
        }
        return false;
    }

    protected async isValidFileURI(uri: URI): Promise<boolean> {
        try {
            const stat = await this.fileService.resolve(uri);
            return !stat.isDirectory;
        } catch { }
        return false;
    }

    protected async toURI(match: string, cwd: URI): Promise<URI | undefined> {
        const path = await this.extractPath(match);
        if (!path) {
            return;
        }
        const pathObj = new Path(path);
        return pathObj.isAbsolute ? cwd.withPath(path) : cwd.resolve(path);
    }

    protected async getCwd(terminal: TerminalWidget): Promise<URI> {
        if (terminal instanceof TerminalWidgetImpl) {
            return terminal.cwd;
        }
        return terminal.lastCwd;
    }

    protected async extractPath(link: string): Promise<string | undefined> {
        const matches: string[] | null = (await this.createRegExp()).exec(link);
        if (!matches) {
            return undefined;
        }
        return matches[1];
    }

    async open(match: string, terminal: TerminalWidget): Promise<void> {
        const toOpen = await this.toURI(match, await this.getCwd(terminal));
        if (!toOpen) {
            return;
        }
        const position = await this.extractPosition(match);
        return this.openURI(toOpen, position);
    }

    async openURI(toOpen: URI, position: Position): Promise<void> {
        let options = {};
        if (position) {
            options = { selection: { start: position } };
        }

        try {
            const opener = await this.openerService.getOpener(toOpen, options);
            opener.open(toOpen, options);
        } catch (err) {
            console.error('Cannot open link ' + toOpen, err);
        }
    }

    protected async extractPosition(link: string): Promise<Position> {
        const matches: string[] | null = (await this.createRegExp()).exec(link);
        const info: Position = { line: 1, character: 1 };

        if (!matches) {
            return info;
        }

        const lineAndColumnMatchIndex = this.getLineAndColumnMatchIndex();
        for (let i = 0; i < lineAndColumnClause.length; i++) {
            const lineMatchIndex = lineAndColumnMatchIndex + (lineAndColumnClauseGroupCount * i);
            const rowNumber = matches[lineMatchIndex];
            if (rowNumber) {
                info.line = parseInt(rowNumber, 10) - 1;
                const columnNumber = matches[lineMatchIndex + 2];
                if (columnNumber) {
                    info.character = parseInt(columnNumber, 10) - 1;
                }
                break;
            }
        }

        return info;
    }

    protected getLineAndColumnMatchIndex(): number {
        return OS.backend.isWindows ? winLineAndColumnMatchIndex : unixLineAndColumnMatchIndex;
    }
}

@injectable()
export class FileDiffPreLinkProvider extends FileLinkProvider {
    override async createRegExp(): Promise<RegExp> {
        return /^--- a\/(\S*)/g;
    }
}

@injectable()
export class FileDiffPostLinkProvider extends FileLinkProvider {
    override async createRegExp(): Promise<RegExp> {
        return /^\+\+\+ b\/(\S*)/g;
    }
}

@injectable()
export class LocalFileLinkProvider extends FileLinkProvider {
    override async createRegExp(): Promise<RegExp> {
        // match links that might not start with a separator, e.g. 'foo.bar', but don't match single words e.g. 'foo'
        const baseLocalUnixLinkClause =
            '((' + pathPrefix + '|' +
            '(' + excludedPathCharactersClause + '+(' + pathSeparatorClause + '|' + '\\.' + ')' + excludedPathCharactersClause + '+))' +
            '(' + pathSeparatorClause + '(' + excludedPathCharactersClause + ')+)*)';

        const baseLocalWindowsLinkClause =
            '((' + winPathPrefix + '|' +
            '(' + winExcludedPathCharactersClause + '+(' + winPathSeparatorClause + '|' + '\\.' + ')' + winExcludedPathCharactersClause + '+))' +
            '(' + winPathSeparatorClause + '(' + winExcludedPathCharactersClause + ')+)*)';

        const baseLocalLinkClause = OS.backend.isWindows ? baseLocalWindowsLinkClause : baseLocalUnixLinkClause;
        return new RegExp(`${baseLocalLinkClause}(${lineAndColumnClause})`, 'g');
    }

    override async provideLinks(line: string, terminal: TerminalWidget): Promise<TerminalLink[]> {
        const links: TerminalLink[] = [];
        const regExp = await this.createRegExp();
        let regExpResult: RegExpExecArray | null;
        while (regExpResult = regExp.exec(line)) {
            const match = regExpResult[0];
            const searchTerm = await this.extractPath(match);
            if (searchTerm) {
                links.push({
                    startIndex: regExp.lastIndex - match.length,
                    length: match.length,
                    handle: async () => {
                        const fileUri = await this.isValidWorkspaceFile(searchTerm, terminal);
                        if (fileUri) {
                            const position = await this.extractPosition(match);
                            this.openURI(fileUri, position);
                        } else {
                            this.quickInputService.open(match);
                        }
                    }
                });
            }
        }
        return links;
    }

    protected override getLineAndColumnMatchIndex(): number {
        return OS.backend.isWindows ? 14 : 12;
    }

    protected async isValidWorkspaceFile(searchTerm: string | undefined, terminal: TerminalWidget): Promise<URI | undefined> {
        if (!searchTerm) {
            return undefined;
        }
        const cwd = await this.getCwd(terminal);
        // remove any leading ./, ../ etc. as they can't be searched
        searchTerm = searchTerm.replace(/^(\.+[\\/])+/, '');
        const workspaceRoots = this.workspaceService.tryGetRoots().map(root => root.resource.toString());
        // try and find a matching file in the workspace
        const files = (await this.searchService.find(searchTerm, {
            rootUris: [cwd.toString(), ...workspaceRoots],
            fuzzyMatch: true,
            limit: 1
        }));
        // checks if the string ends in a separator + searchTerm
        const regex = new RegExp(`[\\\\|\\/]${searchTerm}$`);
        if (files.length && regex.test(files[0])) {
            const fileUri = new URI(files[0]);
            const valid = await this.isValidFileURI(fileUri);
            if (valid) {
                return fileUri;
            }
        }
    }
}

// The following regular expressions are taken from:
// https://github.com/microsoft/vscode/blob/b118105bf28d773fbbce683f7230d058be2f89a7/src/vs/workbench/contrib/terminal/browser/links/terminalLocalLinkDetector.ts#L34-L58

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const pathPrefix = '(\\.\\.?|\\~)';
const pathSeparatorClause = '\\/';
// '":; are allowed in paths but they are often separators so ignore them
// Also disallow \\ to prevent a catastrophic backtracking case #24795
const excludedPathCharactersClause = '[^\\0\\s!`&*()\\[\\]\'":;\\\\]';
/** A regex that matches paths in the form /foo, ~/foo, ./foo, ../foo, foo/bar */
const unixLocalLinkClause = '((' + pathPrefix + '|(' + excludedPathCharactersClause + ')+)?(' + pathSeparatorClause + '(' + excludedPathCharactersClause + ')+)+)';

const winDrivePrefix = '(?:\\\\\\\\\\?\\\\)?[a-zA-Z]:';
const winPathPrefix = '(' + winDrivePrefix + '|\\.\\.?|\\~)';
const winPathSeparatorClause = '(\\\\|\\/)';
const winExcludedPathCharactersClause = '[^\\0<>\\?\\|\\/\\s!`&*()\\[\\]\'":;]';
/** A regex that matches paths in the form \\?\c:\foo c:\foo, ~\foo, .\foo, ..\foo, foo\bar */
const winLocalLinkClause = '((' + winPathPrefix + '|(' + winExcludedPathCharactersClause + ')+)?(' + winPathSeparatorClause + '(' + winExcludedPathCharactersClause + ')+)+)';

/** As xterm reads from DOM, space in that case is non-breaking char ASCII code - 160, replacing space with nonBreakingSpace or space ASCII code - 32. */
const lineAndColumnClause = [
    // "(file path)", line 45 [see #40468]
    '((\\S*)[\'"], line ((\\d+)( column (\\d+))?))',
    // "(file path)",45 [see #78205]
    '((\\S*)[\'"],((\\d+)(:(\\d+))?))',
    // (file path) on line 8, column 13
    '((\\S*) on line ((\\d+)(, column (\\d+))?))',
    // (file path):line 8, column 13
    '((\\S*):line ((\\d+)(, column (\\d+))?))',
    // (file path)(45), (file path) (45), (file path)(45,18), (file path) (45,18), (file path)(45, 18), (file path) (45, 18), also with []
    '(([^\\s\\(\\)]*)(\\s?[\\(\\[](\\d+)(,\\s?(\\d+))?)[\\)\\]])',
    // (file path):336, (file path):336:9
    '(([^:\\s\\(\\)<>\'\"\\[\\]]*)(:(\\d+))?(:(\\d+))?)'
].join('|').replace(/ /g, `[${'\u00A0'} ]`);

// Changing any regex may effect this value, hence changes this as well if required.
const winLineAndColumnMatchIndex = 12;
const unixLineAndColumnMatchIndex = 11;

// Each line and column clause have 6 groups (ie no. of expressions in round brackets)
const lineAndColumnClauseGroupCount = 6;
