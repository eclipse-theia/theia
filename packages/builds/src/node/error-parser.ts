/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as Events from "events";
import * as path from "path";
import { injectable, decorate } from "inversify";

export const IErrorParser = Symbol("IErrorParser");

export interface IErrorParser extends Events.EventEmitter {
    /**
     * starts the parsing, returns a list of errors/warnings found in the input stream,
     * that match given the error matcher.
     */
    parse(errorMatcher: IErrorMatcher, inputStream: NodeJS.ReadableStream): Promise<IParsedError[]>
}

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
    /** paths generated are absolute or relative? values: 'absolute' or 'relative' */
    "fileLocation": string,
    /** Regexp that matches errors/warnings */
    "pattern": IErrorPattern
}

export interface IErrorPattern {
    "patternName": string,
    /** regexp that catches error */
    "regexp": string,
    /** in regexp match, group that represents the file */
    "fileGroup": number,
    /** in regexp match, group that represents the location */
    "locationGroup": number,
    /** in regexp match, group that represents the severity: "error", "warning" */
    "severityGroup": number,
    /** in regexp match, group that represents the error code, if present */
    "codeGroup": number,
    /** in regexp match, group that represents the error message */
    "messageGroup": number
}


/**
 * Class to parse build logs, to find instances of errors and warnings.
 */
decorate(injectable(), Events.EventEmitter);
@injectable()
export class ErrorParser extends Events.EventEmitter implements IErrorParser {

    public parse(errorMatcher: IErrorMatcher, stream: NodeJS.ReadableStream): Promise<IParsedError[]> {
        return new Promise<IParsedError[]>((resolve, reject) => {
            try {
                const errors: IParsedError[] = [];

                // a log chunk has arrived
                stream.on('data', (chunk: Buffer) => {
                    this.doParse(chunk, errorMatcher).forEach(entry => {
                        errors.push(entry);
                    });
                });

                stream.on('error', (err: String) => {
                    reject(err);
                });

                // finished parsing log, emit "done" event
                stream.on('end', () => {
                    this.emit('done', {});
                    resolve(errors);
                });

            } catch (err) {
                reject('Problem reading stream');
            }
        });
    }

    private doParse(buffer: Buffer, errorMatcher: IErrorMatcher): IParsedError[] {
        const parsedEntries: IParsedError[] = [];

        const regex: RegExp = new RegExp(errorMatcher.pattern.regexp, 'gm');
        let match = undefined;

        let fileAndPath = undefined;
        while (match = regex.exec(buffer.toString())) {
            // translate path from relative to absolute, if required
            if (errorMatcher.fileLocation === "relative") {
                // Using __dirname below works for the tests, since they're co-located
                // with this code,  but for a real build log we will need to know
                // the directory where the build is happening. I think we can get
                // that path from the terminal we use to build?
                //
                // note: this could get complicated with e.g. a C/C++ build where the
                // makefile performs changes of directory as it goes...
                fileAndPath = path.resolve(__dirname, match[errorMatcher.pattern.fileGroup]);
            } else {
                fileAndPath = path.resolve(match[errorMatcher.pattern.fileGroup]);
            }
            const parsedEntry: IParsedError = {
                severity: match[errorMatcher.pattern.severityGroup],
                file: fileAndPath,
                location: match[errorMatcher.pattern.locationGroup],
                message: match[errorMatcher.pattern.messageGroup],
                code: match[errorMatcher.pattern.codeGroup]
            };

            // emit new entry immediately
            this.emit('error-found', parsedEntry);

            parsedEntries.push(parsedEntry);
        }
        return parsedEntries;
    }

}
