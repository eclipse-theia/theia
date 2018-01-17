/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as events from "events";
import * as path from "path";
import { injectable, decorate } from "inversify";
import * as readline from "readline";

export const IOutputParser = Symbol("IOutputParser");

export interface IOutputParser extends events.EventEmitter {
    /**
     * starts the parsing, returns a list of entries found in the input,
     * matching the given the matcher.
     * This class also emits the entries it finds, as they are found. Here
     * are the emitted events:
     *
     * 'done': The parsing of provided stream is done.
     * 'entry-found': Emitted for each entry found, matching the IMatcher, along with the entry
     * 'internal-parser-error': An internal error occured, along with the error message. Parsing is over.
     */
    parse(errorMatcher: IMatcher, inputStream: NodeJS.ReadableStream): Promise<IParsedEntry[]>
}

export enum FileLocationKind {
    ABSOLUTE,
    RELATIVE
}

// the following interfaces shamelessly heavily inspired by corresponding vscode ones

/**
 * A parsed error or warning
 */
export interface IParsedEntry {
    /** whether this entry is an error, a warning */
    severity: string,
    /** name of the file where the error occurs */
    file: string,
    /** location within the file. e.g. source code line number, column */
    location: string,
    /** text payload */
    message: string,
    /** reported error code, if any */
    code: string
}

export interface IMatcher {
    // TODO: not all fields are yet used...
    "name": string,
    "label": string,
    /** maps to the build command type? e.g. "typescript", "gcc/g++", ... */
    "owner": string,
    /**
     * Whether the file path's in the log are expected to be absolute or relative.
     * values: 'absolute' or 'relative'
     */
    "fileLocation": FileLocationKind,
    /**
     * for fileLocation === RELATIVE, this is to be used as the base path
     */
    "filePrefix"?: string,
    /** Regexp that matches errors/warnings */
    "pattern": IPattern
}

export interface IPattern {
    "patternName": string,
    /** regexp that catches the wanted entry */
    "regexp": string,
    /** in regexp match, group that contains the file */
    "file": number,
    /** in regexp match, group that contains the location */
    "location": number,
    /** in regexp match, group that contains the severity: "error", "warning" */
    "severity"?: number,
    /** in regexp match, group that contains the error code, if present */
    "code"?: number,
    /** in regexp match, group that contains the text message */
    "message": number
}

/**
 * Class to parse build logs, to find instances of errors and warnings.
 */
decorate(injectable(), events.EventEmitter);
@injectable()
export class OutputParser extends events.EventEmitter implements IOutputParser {

    public parse(matcher: IMatcher, stream: NodeJS.ReadableStream): Promise<IParsedEntry[]> {
        return new Promise<IParsedEntry[]>((resolve, reject) => {
            try {
                const matchedEntries: IParsedEntry[] = [];
                const lineReader = readline.createInterface({
                    input: stream
                });

                // parse log line-by-line
                lineReader.on('line', (line: string) => {
                    this.doParse(line, matcher);
                });

                stream.on('error', (err: String) => {
                    // fire event
                    this.emit('internal-parser-error', err);
                    reject(err);
                });

                // finished parsing log, emit "done" event
                stream.on('end', () => {
                    this.emit('done', {});
                    resolve(matchedEntries);
                });

                this.on('entry-found', (entry: IParsedEntry) => {
                    matchedEntries.push(entry);
                });

            } catch (err) {
                // fire event
                this.emit('internal-parser-error', err);
                reject('Problem reading stream');
            }
        });
    }

    private doParse(line: string, matcher: IMatcher): void {
        const regex: RegExp = new RegExp(matcher.pattern.regexp, 'gm');
        let match = undefined;

        let fileAndPath = undefined;

        if (match = regex.exec(line)) {
            if (matcher.fileLocation === FileLocationKind.RELATIVE) {
                if (matcher.filePrefix) {
                    fileAndPath = path.resolve(matcher.filePrefix, match[matcher.pattern.file]);
                } else {
                    // we seem to be missing information to transform the relative path
                    // into an absolute one. Let's report the relative path for now
                    fileAndPath = path.resolve(match[matcher.pattern.file]);
                }
            } else {
                fileAndPath = path.resolve(match[matcher.pattern.file]);
            }
            const parsedEntry: IParsedEntry = {
                severity: (typeof matcher.pattern.location === "number") ? match[<number>matcher.pattern.severity] : "",
                file: fileAndPath,
                location: match[matcher.pattern.location],
                message: match[matcher.pattern.message],
                code: (typeof matcher.pattern.code === "number") ? match[matcher.pattern.code] : ""
            };

            // default severity is error
            if (parsedEntry.severity === undefined) {
                parsedEntry.severity = 'error';
            }

            // emit new entry immediately
            this.emit('entry-found', parsedEntry);
        }
    }

}
