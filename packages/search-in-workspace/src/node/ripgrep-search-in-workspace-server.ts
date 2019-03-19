/********************************************************************************
 * Copyright (C) 2017-2018 Ericsson and others.
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

import { ILogger } from '@theia/core';
import { RawProcess, RawProcessFactory, RawProcessOptions } from '@theia/process/lib/node';
import { FileUri } from '@theia/core/lib/node/file-uri';
import URI from '@theia/core/lib/common/uri';
import { inject, injectable } from 'inversify';
import { SearchInWorkspaceServer, SearchInWorkspaceOptions, SearchInWorkspaceResult, SearchInWorkspaceClient } from '../common/search-in-workspace-interface';

export const RgPath = Symbol('RgPath');

/**
 * Typing for ripgrep's arbitrary data object:
 *
 *   https://docs.rs/grep-printer/0.1.0/grep_printer/struct.JSON.html#object-arbitrary-data
 */
interface RipGrepArbitraryData {
    text?: string;
    bytes?: string;
}

/**
 * Convert the length of a range in `text` expressed in bytes to a number of
 * characters (or more precisely, code points).  The range starts at character
 * `charStart` in `text`.
 */
function byteRangeLengthToCharacterLength(text: string, charStart: number, byteLength: number): number {
    let char: number = charStart;
    for (let byteIdx = 0; byteIdx < byteLength; char++) {
        const codePoint: number = text.charCodeAt(char);
        if (codePoint < 0x7F) {
            byteIdx++;
        } else if (codePoint < 0x7FF) {
            byteIdx += 2;
        } else if (codePoint < 0xFFFF) {
            byteIdx += 3;
        } else if (codePoint < 0x10FFFF) {
            byteIdx += 4;
        } else {
            throw new Error('Invalid UTF-8 string');
        }
    }

    return char - charStart;
}

@injectable()
export class RipgrepSearchInWorkspaceServer implements SearchInWorkspaceServer {

    // List of ongoing searches, maps search id to a the started rg process.
    private ongoingSearches: Map<number, RawProcess> = new Map();

    // Each incoming search is given a unique id, returned to the client.  This is the next id we will assigned.
    private nextSearchId: number = 0;

    private client: SearchInWorkspaceClient | undefined;

    @inject(RgPath)
    protected readonly rgPath: string;

    constructor(
        @inject(ILogger) protected readonly logger: ILogger,
        @inject(RawProcessFactory) protected readonly rawProcessFactory: RawProcessFactory,
    ) { }

    setClient(client: SearchInWorkspaceClient | undefined): void {
        this.client = client;
    }

    protected getArgs(options?: SearchInWorkspaceOptions): string[] {
        const args = ['--json', '--max-count=100'];
        args.push(options && options.matchCase ? '--case-sensitive' : '--ignore-case');
        if (options && options.includeIgnored) {
            args.push('-uu');
        }
        if (options && options.include) {
            for (const include of options.include) {
                if (include !== '') {
                    args.push('--glob=**/' + include);
                }
            }
        }
        if (options && options.exclude) {
            for (const exclude of options.exclude) {
                if (exclude !== '') {
                    args.push('--glob=!**/' + exclude);
                }
            }
        }
        if (options && options.useRegExp || options && options.matchWholeWord) {
            args.push('--regexp');
        } else {
            args.push('--fixed-strings');
            args.push('--');
        }
        return args;
    }

    // Search for the string WHAT in directories ROOTURIS.  Return the assigned search id.
    search(what: string, rootUris: string[], opts?: SearchInWorkspaceOptions): Promise<number> {
        // Start the rg process.  Use --vimgrep to get one result per
        // line, --color=always to get color control characters that
        // we'll use to parse the lines.
        const searchId = this.nextSearchId++;
        const args = this.getArgs(opts);
        // if we use matchWholeWord we use regExp internally,
        // so, we need to escape regexp characters if we actually not set regexp true in UI.
        if (opts && opts.matchWholeWord && !opts.useRegExp) {
            what = what.replace(/[\-\\\{\}\*\+\?\|\^\$\.\[\]\(\)\#]/g, '\\$&');
            if (!/\B/.test(what.charAt(0))) {
                what = '\\b' + what;
            }
            if (!/\B/.test(what.charAt(what.length - 1))) {
                what = what + '\\b';
            }
        }

        const processOptions: RawProcessOptions = {
            command: this.rgPath,
            args: [...args, what].concat(rootUris.map(root => FileUri.fsPath(root)))
        };

        // TODO: Use child_process directly instead of rawProcessFactory?
        const rgProcess: RawProcess = this.rawProcessFactory(processOptions);
        this.ongoingSearches.set(searchId, rgProcess);

        rgProcess.onError(error => {
            // tslint:disable-next-line:no-any
            let errorCode = (error as any).code;

            // Try to provide somewhat clearer error messages, if possible.
            if (errorCode === 'ENOENT') {
                errorCode = 'could not find the ripgrep (rg) binary';
            } else if (errorCode === 'EACCES') {
                errorCode = 'could not execute the ripgrep (rg) binary';
            }

            const errorStr = `An error happened while searching (${errorCode}).`;
            this.wrapUpSearch(searchId, errorStr);
        });

        // Running counter of results.
        let numResults = 0;

        // Buffer to accumulate incoming output.
        let databuf: string = '';

        rgProcess.outputStream.on('data', (chunk: string) => {
            // We might have already reached the max number of
            // results, sent a TERM signal to rg, but we still get
            // the data that was already output in the mean time.
            // It's not necessary to return early here (the check
            // for maxResults below would avoid sending extra
            // results), but it avoids doing unnecessary work.
            if (opts && opts.maxResults && numResults >= opts.maxResults) {
                return;
            }

            databuf += chunk;

            while (1) {
                // Check if we have a complete line.
                const eolIdx = databuf.indexOf('\n');
                if (eolIdx < 0) {
                    break;
                }

                // Get and remove the line from the data buffer.
                const lineBuf = databuf.slice(0, eolIdx);
                databuf = databuf.slice(eolIdx + 1);

                const obj = JSON.parse(lineBuf);

                if (obj['type'] === 'match') {
                    const data = obj['data'];
                    const file = (<RipGrepArbitraryData>data['path']).text;
                    const line = data['line_number'];
                    const lineText = (<RipGrepArbitraryData>data['lines']).text;

                    if (file === undefined || lineText === undefined) {
                        continue;
                    }

                    for (const submatch of data['submatches']) {
                        const startByte = submatch['start'];
                        const endByte = submatch['end'];
                        const character = byteRangeLengthToCharacterLength(lineText, 0, startByte);
                        const length = byteRangeLengthToCharacterLength(lineText, character, endByte - startByte);

                        const result: SearchInWorkspaceResult = {
                            fileUri: FileUri.create(file).toString(),
                            root: this.getRoot(file, rootUris).toString(),
                            line,
                            character: character + 1,
                            length,
                            lineText: lineText.replace(/[\r\n]+$/, ''),
                        };

                        numResults++;
                        if (this.client) {
                            this.client.onResult(searchId, result);
                        }

                        // Did we reach the maximum number of results?
                        if (opts && opts.maxResults && numResults >= opts.maxResults) {
                            rgProcess.kill();
                            this.wrapUpSearch(searchId);
                            break;
                        }
                    }
                }
            }
        });

        rgProcess.outputStream.on('end', () => {
            // If we reached maxResults, we should have already
            // wrapped up the search.  Returning early avoids
            // logging a warning message in wrapUpSearch.
            if (opts && opts.maxResults && numResults >= opts.maxResults) {
                return;
            }

            this.wrapUpSearch(searchId);
        });

        return Promise.resolve(searchId);
    }

    /**
     * Returns the root folder uri that a file belongs to.
     * In case that a file belongs to more than one root folders, returns the root folder that is closest to the file.
     * If the file is not from the current workspace, returns empty string.
     * @param filePath string path of the file
     * @param rootUris string URIs of the root folders in the current workspace
     */
    private getRoot(filePath: string, rootUris: string[]): URI {
        const roots = rootUris.filter(root => new URI(root).withScheme('file').isEqualOrParent(FileUri.create(filePath).withScheme('file')));
        if (roots.length > 0) {
            return FileUri.create(FileUri.fsPath(roots.sort((r1, r2) => r2.length - r1.length)[0]));
        }
        return new URI();
    }

    // Cancel an ongoing search.  Trying to cancel a search that doesn't exist isn't an
    // error, otherwise we'd have to deal with race conditions, where a client cancels a
    // search that finishes normally at the same time.
    cancel(searchId: number): Promise<void> {
        const process = this.ongoingSearches.get(searchId);
        if (process) {
            process.kill();
            this.wrapUpSearch(searchId);
        }

        return Promise.resolve();
    }

    // Send onDone to the client and clean up what we know about search searchId.
    private wrapUpSearch(searchId: number, error?: string) {
        if (this.ongoingSearches.delete(searchId)) {
            if (this.client) {
                this.logger.debug('Sending onDone for ' + searchId, error);
                this.client.onDone(searchId, error);
            } else {
                this.logger.debug('Wrapping up search ' + searchId + ' but no client');
            }
        } else {
            this.logger.debug("Trying to wrap up a search we don't know about " + searchId);
        }
    }

    dispose(): void {
    }
}
