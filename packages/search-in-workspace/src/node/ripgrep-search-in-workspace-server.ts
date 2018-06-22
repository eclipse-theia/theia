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

import { SearchInWorkspaceServer, SearchInWorkspaceOptions, SearchInWorkspaceResult, SearchInWorkspaceClient } from "../common/search-in-workspace-interface";
import { ILogger } from "@theia/core";
import { inject, injectable } from "inversify";
import { RawProcess, RawProcessFactory, RawProcessOptions } from '@theia/process/lib/node';
import { rgPath } from "vscode-ripgrep";

@injectable()
export class RipgrepSearchInWorkspaceServer implements SearchInWorkspaceServer {

    // List of ongoing searches, maps search id to a the started rg process.
    private ongoingSearches: Map<number, RawProcess> = new Map();

    // Each incoming search is given a unique id, returned to the client.  This is the next id we will assigned.
    private nextSearchId: number = 0;

    private client: SearchInWorkspaceClient | undefined;

    // Highlighted red
    private readonly FILENAME_START = '^\x1b\\[0?m\x1b\\[31m';
    private readonly FILENAME_END = '\x1b\\[0?m:';
    // Highlighted green
    private readonly LINE_START = '^\x1b\\[0?m\x1b\\[32m';
    private readonly LINE_END = '\x1b\\[0?m:';
    // Highlighted yellow
    private readonly CHARACTER_START = '^\x1b\\[0?m\x1b\\[33m';
    private readonly CHARACTER_END = '\x1b\\[0?m:';
    // Highlighted blue
    private readonly MATCH_START = '\x1b\\[0?m\x1b\\[34m';
    private readonly MATCH_END = '\x1b\\[0?m';

    constructor(
        @inject(ILogger) protected readonly logger: ILogger,
        @inject(RawProcessFactory) protected readonly rawProcessFactory: RawProcessFactory,
    ) { }

    setClient(client: SearchInWorkspaceClient | undefined): void {
        this.client = client;
    }

    protected getArgs(options?: SearchInWorkspaceOptions): string[] {
        const args = ["--vimgrep", "--color=always",
            "--colors=path:none",
            "--colors=line:none",
            "--colors=column:none",
            "--colors=match:none",
            "--colors=path:fg:red",
            "--colors=line:fg:green",
            "--colors=column:fg:yellow",
            "--colors=match:fg:blue",
            "--sort-files",
            "--max-count=100",
            "--max-columns=250"];
        args.push(options && options.matchCase ? "--case-sensitive" : "--ignore-case");
        if (options && options.matchWholeWord) {
            args.push("--word-regexp");
        }
        if (options && options.includeIgnored) {
            args.push("-uu");
        }
        args.push(options && options.useRegExp ? "--regexp" : "--fixed-strings");
        return args;
    }

    // Search for the string WHAT in directory ROOT.  Return the assigned search id.
    search(what: string, root: string, opts?: SearchInWorkspaceOptions): Promise<number> {
        // Start the rg process.  Use --vimgrep to get one result per
        // line, --color=always to get color control characters that
        // we'll use to parse the lines.
        const searchId = this.nextSearchId++;
        const args = this.getArgs(opts);
        const globs = [];
        if (opts && opts.include) {
            for (const include of opts.include) {
                if (include !== "") {
                    globs.push('--glob=**/' + include);
                }
            }
        }
        if (opts && opts.exclude) {
            for (const exclude of opts.exclude) {
                if (exclude !== "") {
                    globs.push('--glob=!**/' + exclude);
                }
            }
        }
        const processOptions: RawProcessOptions = {
            command: rgPath,
            args: [...args, what, ...globs, root]
        };
        const process: RawProcess = this.rawProcessFactory(processOptions);
        this.ongoingSearches.set(searchId, process);

        process.onError(error => {
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
        let databuf: string = "";

        const lastMatch = {
            file: '',
            line: 0,
            index: 0,
        };

        process.output.on('data', (chunk: string) => {
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
                let lineBuf = databuf.slice(0, eolIdx);
                databuf = databuf.slice(eolIdx + 1);

                // Extract the various fields using the ANSI
                // control characters for colors as guides.

                // Extract filename (magenta).
                const filenameRE = new RegExp(`${this.FILENAME_START}(.+?)${this.FILENAME_END}`);
                let match = filenameRE.exec(lineBuf);
                if (!match) {
                    continue;
                }

                const filename = match[1];
                lineBuf = lineBuf.slice(match[0].length);

                // Extract line number (green).
                const lineRE = new RegExp(`${this.LINE_START}(\\d+)${this.LINE_END}`);
                match = lineRE.exec(lineBuf);
                if (!match) {
                    continue;
                }

                const line = +match[1];
                lineBuf = lineBuf.slice(match[0].length);

                // Extract character number (column), but don't
                // do anything with it.  ripgrep reports the
                // offset in bytes, which is not good when
                // dealing with multi-byte UTF-8 characters.
                const characterNumRE = new RegExp(`${this.CHARACTER_START}(\\d+)${this.CHARACTER_END}`);
                match = characterNumRE.exec(lineBuf);
                if (!match) {
                    continue;
                }

                lineBuf = lineBuf.slice(match[0].length);

                // If there are two matches in a line,
                // --vimgrep will make rg output two lines, but
                // both matches will be highlighted in both
                // lines.  If we have consecutive matches at
                // the same file / line, make sure to pick the
                // right highlighted match.
                if (lastMatch.file === filename && lastMatch.line === line) {
                    lastMatch.index++;
                } else {
                    lastMatch.file = filename;
                    lastMatch.line = line;
                    lastMatch.index = 0;
                }

                // Extract the match text (red).
                const matchRE = new RegExp(`${this.MATCH_START}(.*?)${this.MATCH_END}`);

                let characterNum = 0;

                let matchWeAreLookingFor: RegExpMatchArray | undefined = undefined;
                for (let i = 0; ; i++) {
                    const nextMatch = lineBuf.match(matchRE);

                    if (!nextMatch) {
                        break;
                    }

                    // Just to make typescript happy.
                    if (nextMatch.index === undefined) {
                        break;
                    }

                    if (i === lastMatch.index) {
                        matchWeAreLookingFor = nextMatch;
                        characterNum = nextMatch.index + 1;
                    }

                    // Remove the control characters around the match.  This allows to:

                    //   - prepare the line text so it can be returned to the client without control characters
                    //   - get the character index of subsequent matches right

                    lineBuf =
                        lineBuf.slice(0, nextMatch.index)
                        + nextMatch[1]
                        + lineBuf.slice(nextMatch.index + nextMatch[0].length);
                }

                if (!matchWeAreLookingFor || characterNum === 0) {
                    continue;
                }

                if (matchWeAreLookingFor[1].length === 0) {
                    continue;
                }

                const result: SearchInWorkspaceResult = {
                    file: filename,
                    line: line,
                    character: characterNum,
                    length: matchWeAreLookingFor[1].length,
                    lineText: lineBuf,
                };

                numResults++;
                if (this.client) {
                    this.client.onResult(searchId, result);
                }

                // Did we reach the maximum number of results?
                if (opts && opts.maxResults && numResults >= opts.maxResults) {
                    process.kill();
                    this.wrapUpSearch(searchId);
                    break;
                }
            }
        });

        process.output.on('end', () => {
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
                this.logger.debug("Sending onDone for " + searchId, error);
                this.client.onDone(searchId, error);
            } else {
                this.logger.debug("Wrapping up search " + searchId + " but no client");
            }
        } else {
            this.logger.debug("Trying to wrap up a search we don't know about " + searchId);
        }
    }

    dispose(): void {
    }
}
