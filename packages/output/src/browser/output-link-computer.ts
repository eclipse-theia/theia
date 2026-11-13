// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import type * as monaco from '@theia/monaco-editor-core';
import { injectable } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { escapeRegExpCharacters } from '@theia/core/lib/common/strings';

export interface OutputLinkWorkspaceFolder {
    uri: URI;
    /** The OS-specific path of the folder, as it appears in tool output. */
    fsPath: string;
}

/**
 * Detects paths of files in the workspace folders in output channel content.
 * Like VS Code, only absolute paths that start with a workspace folder are linked.
 */
@injectable()
export class OutputLinkComputer {

    protected patterns: { folder: URI, regExps: RegExp[] }[] = [];

    setWorkspaceFolders(folders: OutputLinkWorkspaceFolder[]): void {
        this.patterns = folders.map(folder => ({ folder: folder.uri, regExps: this.createPatterns(folder.fsPath) }));
    }

    protected createPatterns(folderPath: string): RegExp[] {
        const folderPaths = [folderPath];
        if (folderPath.includes('\\')) {
            // Windows tools print forward slashes as well
            folderPaths.push(folderPath.replace(/\\/g, '/'));
        }
        const pathCharacter = '[^\\s\\(\\):<>\'"]';
        const pathCharacterOrSpace = `(?:${pathCharacter}| ${pathCharacter})`;
        // a path that ends with a file extension, it may contain single spaces
        const pathWithExtension = `${pathCharacterOrSpace}+\\.${pathCharacter}+`;
        const strictPath = `${pathCharacter}+`;
        return folderPaths.flatMap(path => {
            // the path of a file system root already ends with a separator
            const separator = /[\\/]$/.test(path) ? '' : '[\\\\/]';
            const folder = `${escapeRegExpCharacters(path)}${separator}`;
            return [
                // /ws/src/server.js on line 8, column 13
                `${folder}(?<path>${pathWithExtension}) on line (?<line>\\d+)(?:, column (?<column>\\d+))?`,
                // /ws/src/server.js:line 8, column 13
                `${folder}(?<path>${pathWithExtension}):line (?<line>\\d+)(?:, column (?<column>\\d+))?`,
                // /ws/src/Features.ts(45,18): error
                `${folder}(?<path>${pathWithExtension})\\s?\\((?<line>\\d+)(?:,(?<column>\\d+))?\\)`,
                // /ws/src/Game.ts:336:9
                `${folder}(?<path>${strictPath})(?::(?<line>\\d+))?(?::(?<column>\\d+))?`
            ].map(pattern => new RegExp(pattern, 'gi'));
        });
    }

    computeLinks(lines: string[]): monaco.languages.ILink[] {
        const links: monaco.languages.ILink[] = [];
        lines.forEach((line, index) => {
            const lineNumber = index + 1;
            const lineLinks: monaco.languages.ILink[] = [];
            for (const { folder, regExps } of this.patterns) {
                for (const regExp of regExps) {
                    regExp.lastIndex = 0;
                    let match: RegExpExecArray | null;
                    while (match = regExp.exec(line)) {
                        const startColumn = match.index + 1;
                        const endColumn = startColumn + match[0].length;
                        const overlaps = lineLinks.some(link => link.range.startColumn < endColumn && startColumn < link.range.endColumn);
                        if (!overlaps) {
                            lineLinks.push({
                                range: { startLineNumber: lineNumber, startColumn, endLineNumber: lineNumber, endColumn },
                                url: this.toUri(folder, match.groups!).toString()
                            });
                        }
                    }
                }
            }
            links.push(...lineLinks);
        });
        return links;
    }

    protected toUri(folder: URI, groups: Record<string, string | undefined>): URI {
        const uri = folder.resolve(groups.path!);
        if (!groups.line) {
            return uri;
        }
        return uri.withFragment(groups.column ? `L${groups.line},${groups.column}` : `L${groups.line}`);
    }
}

