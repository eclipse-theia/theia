/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { IOutputParser, IMatcher, IPattern, FileLocationKind } from "./output-parser";
import * as fs from 'fs';
import * as stream from 'stream';
import * as chai from "chai";
import "mocha";
import * as chaiAsPromised from "chai-as-promised";
import { TestUtils } from "./parser-spec-utils";
import * as path from "path";

import { testContainer } from "./inversify.spec-config";

chai.use(chaiAsPromised);
const expect = chai.expect;

// mock having the base path for a tcs compilation
// IRL, we can get his from the build command CWD
// parameter or such
const TSC_BASE_PATH: string = "/this/is/the/base/path";

// tsc error pattern
const tscErrorPattern: IPattern = {
    "patternName": "tsc",
    "regexp": '(.*)\\s\\(([\\d,]+)\\):\\s(.*)\\((\\d+)\\)',
    "file": 1,
    "location": 2,
    "code": 4,
    "message": 3
};
const tscErrorMatcher: IMatcher = {
    "name": "TypeScript compiler",
    "label": "TypeScript errors",
    "owner": "tsc",
    "fileLocation": FileLocationKind.RELATIVE,
    "filePrefix": TSC_BASE_PATH,
    "pattern": tscErrorPattern
};

// gcc/g++ compiler
const gccErrorPattern: IPattern = {
    "patternName": "gnu-c-cpp compiler",
    "regexp": '(.*?):(\\d+:\\d+):?\\s*([Ee]rror|ERROR|[Ww]arning): (.*)',
    "file": 1,
    "location": 2,
    "severity": 3,
    "message": 4
};
const gccErrorMatcher: IMatcher = {
    "name": "gnu-c-cpp compiler",
    "label": "gcc/g++ errors",
    "owner": "gnu-c-cpp",
    "fileLocation": FileLocationKind.RELATIVE,
    "pattern": gccErrorPattern
};

// gcc/g++ linker
const gccLinkerErrorPattern: IPattern = {
    "patternName": "gnu-c-cpp linker",
    "regexp": '(.*):(\\d+):\\s(.*\\s[tof]+\\s`.*\')',
    "file": 1,
    "location": 2,
    "message": 3
};
const gccLinkerErrorMatcher: IMatcher = {
    "name": "gnu-c-cpp linker",
    "label": "gcc/g++ errors",
    "owner": "gnu-c-cpp",
    "fileLocation": FileLocationKind.ABSOLUTE,
    "pattern": gccLinkerErrorPattern
};

describe("output-parser", () => {
    let parser: IOutputParser;
    beforeEach(function () {
        parser = testContainer.get<IOutputParser>(IOutputParser);
    });

    describe('parse simple gcc error log', () => {
        it('verify compiler errors and warning are found', () => {
            const logName = '/test-resources/' + 'error.txt';
            const readStream = fs.createReadStream(__dirname + logName);
            gccErrorMatcher.filePrefix = __dirname;

            const promise = parser.parse(gccErrorMatcher, readStream);
            const expectedFileName = path.resolve(gccErrorMatcher.filePrefix, 'regex.c');

            return expect(promise).to.eventually.deep.equal(
                [{
                    "file": expectedFileName,
                    "location": "280:4",
                    "severity": "error",
                    "message": '‘spatule’ undeclared (first use in this function)',
                    "code": ""
                },
                {
                    "file": expectedFileName,
                    "location": "281:4",
                    "severity": "error",
                    "message": 'expected ‘;’ before ‘register’',
                    "code": ""
                },
                {
                    "file": expectedFileName,
                    "location": "288:9",
                    "severity": "error",
                    "message": '‘c’ undeclared (first use in this function)',
                    "code": ""
                },
                {
                    "file": expectedFileName,
                    "location": "282:8",
                    "message": "unused variable ‘spatule’ [-Wunused-variable]",
                    "severity": "warning",
                    "code": ""
                }
                ]
            );

        });

        it('verify linker error is found', () => {
            const logName = '/test-resources/' + 'linker.txt';
            const readStream = fs.createReadStream(__dirname + logName);
            const promise = parser.parse(gccLinkerErrorMatcher, readStream);

            return expect(promise).to.eventually.deep.equal(
                [{
                    "file": path.resolve("/tmp/gdb-8.0/zlib/inflate.c"),
                    "location": "118",
                    "message": "undefined reference to `SPATULE'",
                    "severity": 'error',
                    "code": ""
                }
                ]
            );
        });

        it('verify we handle parser input stream emiting "error"', () => {
            const mockedStream = new stream.Readable();
            mockedStream._read = function noop() { };

            const promise = parser.parse(gccLinkerErrorMatcher, mockedStream);
            const errorMessage = 'this is a test error';
            mockedStream.emit('error', errorMessage);

            return expect(promise).to.eventually.be.rejectedWith(errorMessage);
        });

        it('verify parser emits error when input stream emiting "error"', () => {
            const mockedStream = new stream.Readable();
            mockedStream._read = function noop() { };

            const promise = parser.parse(gccLinkerErrorMatcher, mockedStream);
            const errorMessage = 'this is a test error';

            const promise2 = TestUtils.waitForNamedEventCount(parser, 'internal-parser-error', 1);
            mockedStream.emit('error', errorMessage);

            // "handle" promise rejection
            promise.then(() => { }).catch(() => { });

            return expect(promise2).to.eventually.deep.equal([errorMessage]);
        });
    });

    describe('parse large gcc build log', () => {
        it('verify compiler error is found', () => {
            const logName = '/test-resources/' + 'largeOutput.txt';
            const readStream = fs.createReadStream(__dirname + logName);
            gccErrorMatcher.filePrefix = __dirname;
            const promise = parser.parse(gccErrorMatcher, readStream);
            const expectedFileName = path.resolve(gccErrorMatcher.filePrefix, 'remote-utils.c');

            return expect(promise).to.eventually.deep.equal(
                [{
                    "file": expectedFileName,
                    "location": "1455:22",
                    "severity": "error",
                    "message": '‘p’ was not declared in this scope',
                    "code": ""
                }
                ]
            );
        });
    });

    describe('parse gcc build log, catch entries as they are parsed', () => {
        const logName = '/test-resources/' + 'error.txt';
        let readStream: NodeJS.ReadableStream;
        gccErrorMatcher.filePrefix = __dirname;
        const expectedFileName = path.resolve(gccErrorMatcher.filePrefix, 'regex.c');

        beforeEach(() => {
            readStream = fs.createReadStream(__dirname + logName);
        });

        it('verify parser emits "entry-found" events as entries are parsed', () => {
            parser.parse(gccErrorMatcher, readStream);

            // we expect 4 errors/warnings to be found
            // tslint:disable-next-line:no-magic-numbers
            const promise = TestUtils.waitForNamedEventCount(parser, 'entry-found', 4);

            return expect(promise).to.eventually.be.deep.equal(
                [
                    {
                        "file": expectedFileName,
                        "location": "280:4",
                        "severity": "error",
                        "message": '‘spatule’ undeclared (first use in this function)',
                        "code": ""
                    },
                    {
                        "file": expectedFileName,
                        "location": "281:4",
                        "severity": "error",
                        "message": 'expected ‘;’ before ‘register’',
                        "code": ""
                    },
                    {
                        "file": expectedFileName,
                        "location": "288:9",
                        "severity": "error",
                        "message": '‘c’ undeclared (first use in this function)',
                        "code": ""
                    },
                    {
                        "file": expectedFileName,
                        "location": "282:8",
                        "message": "unused variable ‘spatule’ [-Wunused-variable]",
                        "severity": "warning",
                        "code": ""
                    }
                ]
            );

        });

        it('verify parser emits event "done" when parsing is done', () => {
            parser.parse(gccErrorMatcher, readStream);
            const promise = TestUtils.waitForNamedEvent(parser, 'done');

            return expect(promise).to.eventually.be.deep.equal(
                {}
            );

        });

    });

    describe('parse other types of logs', () => {
        const tscErrorLine = "src/node/error-parser.spec.ts (31,4): Cannot find name 'z'. (2304)";
        let mockedStream: stream.Readable;

        beforeEach(() => {
            mockedStream = new stream.Readable();
        });

        it('verify parsed tsc error with a provided filePrefix results in file having expected absolute path', () => {
            const promise = parser.parse(tscErrorMatcher, mockedStream);

            mockedStream.emit('data', tscErrorLine);
            mockedStream.emit('end');

            return expect(promise).to.eventually.deep.equal(
                [{
                    "code": "2304",
                    "file": path.resolve(TSC_BASE_PATH, 'src/node/error-parser.spec.ts'),
                    "location": "31,4",
                    "message": "Cannot find name 'z'. ",
                    "severity": 'error'
                }
                ]
            );
        });

        it('verify parsed tsc error without a provided filePrefix results in file having a relative path', () => {
            tscErrorMatcher.filePrefix = '';
            const promise = parser.parse(tscErrorMatcher, mockedStream);

            mockedStream.emit('data', tscErrorLine);
            mockedStream.emit('end');

            return expect(promise).to.eventually.deep.equal(
                [{
                    "code": "2304",
                    "file": path.resolve('src/node/error-parser.spec.ts'),
                    "location": "31,4",
                    "message": "Cannot find name 'z'. ",
                    "severity": 'error'
                }
                ]
            );
        });
    });

});
