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

export const IErrorParser = Symbol("IErrorParser");

export interface IErrorParser extends events.EventEmitter {
    /**
     * starts the parsing, returns a list of errors/warnings found in the input,
     * matching the given the error matcher.
     * This class also emits the error/warnings it finds, as they are found. Here
     * are the emitted events:
     *
     * 'done': The parsing of provided stream is done.
     * 'entry-found': Emitted for each entry matching the IErrorMatcher was found, along with the entry (IParsedError)
     * 'internal-parser-error': 
     */
    parse(errorMatcher: IErrorMatcher, inputStream: NodeJS.ReadableStream): Promise<IParsedError[]>
}

export enum FileLocationKind {
    ABSOLUTE,
    RELATIVE
}

// the following interfaces shamelessly heavily inspired by corresponding vscode ones

/**
 * A parsed error or warning
 */
export interface IParsedError {
    /** whether this entry is an error, a warning */
    severity: string,
    /** name of the file where the error occurs */
    file: string,
    /** location within the file. e.g. source code line number, column */
    location: string,
    /** text of the error or warning */
    message: string,
    /** reported error code, if any */
    code: string
}

export interface IErrorMatcher {
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
    /** Regexp that matches errors/warnings */
    "pattern": IErrorPattern
}

export interface IErrorPattern {
    "patternName": string,
    /** regexp that catches error */
    "regexp": string,
    /** in regexp match, group that contains the file */
    "file": number,
    /** in regexp match, group that contains the location */
    "location": number,
    /** in regexp match, group that contains the severity: "error", "warning" */
    "severity": number,
    /** in regexp match, group that contains the error code, if present */
    "code": number,
    /** in regexp match, group that contains the error message */
    "message": number
}


/**
 * Class to parse build logs, to find instances of errors and warnings.
 */
decorate(injectable(), events.EventEmitter);
@injectable()
export class ErrorParser extends events.EventEmitter implements IErrorParser {

    public parse(errorMatcher: IErrorMatcher, stream: NodeJS.ReadableStream): Promise<IParsedError[]> {
        return new Promise<IParsedError[]>((resolve, reject) => {
            try {
                const errors: IParsedError[] = [];
                const lineReader = readline.createInterface({
                    input: stream
                });

                // parse log line-by-line
                lineReader.on('line', (line: string) => {
                    this.doParse(line, errorMatcher);
                });

                stream.on('error', (err: String) => {
                    // fire event
                    this.emit('internal-parser-error', err);

                    reject(err);
                });

                // finished parsing log, emit "done" event
                stream.on('end', () => {
                    this.emit('done', {});
                    resolve(errors);
                });

                this.on('entry-found', (entry: IParsedError) => {
                    errors.push(entry);
                });

            } catch (err) {
                // fire event
                this.emit('internal-parser-error', err);

                reject('Problem reading stream');
            }
        });
    }

    private doParse(line: string, errorMatcher: IErrorMatcher): void {
        const regex: RegExp = new RegExp(errorMatcher.pattern.regexp, 'gm');
        let match = undefined;

        let fileAndPath = undefined;

        if (match = regex.exec(line)) {
            if (errorMatcher.fileLocation === FileLocationKind.RELATIVE) {
                // Using __dirname below works for the tests, since they're co-located
                // with this code,  but for a real build log we will need to know
                // the directory where the build is happening. I think we can get
                // that path from the terminal we use to build?
                //
                // note: this could get complicated with e.g. a C/C++ build where the
                // makefile performs changes of directory as it goes...
                fileAndPath = path.resolve(__dirname, match[errorMatcher.pattern.file]);
            } else {
                fileAndPath = path.resolve(match[errorMatcher.pattern.file]);
            }
            const parsedEntry: IParsedError = {
                severity: match[errorMatcher.pattern.severity],
                file: fileAndPath,
                location: match[errorMatcher.pattern.location],
                message: match[errorMatcher.pattern.message],
                code: match[errorMatcher.pattern.code]
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
