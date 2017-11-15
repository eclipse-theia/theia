/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as yargs from "yargs";
import * as chai from "chai";
import { CliManager, CliContribution } from './cli';
import { Deferred } from '../common/promise-util';

class TestCliManager extends CliManager {

    args: string[];

    constructor(...contribs: CliContribution[]) {
        super({
            getContributions() { return contribs; }
        });
    }

    setArgs(...args: string[]) {
        this.args = args;
    }

    getArgs() {
        return this.args;
    }
}

beforeEach(() => {
    yargs.reset();
});

describe('CliManager', () => {
    it("Parses simple option", async () => {
        const value = new Deferred<string>();
        const mnr = new TestCliManager({
            configure(conf: yargs.Argv) {
                conf.option('foo', { alias: 'f', description: 'Some foo.' });
                conf.option('bar', { alias: 'b', description: 'Some bla.', default: 'my-default', type: 'string' });
            },
            setArguments(args: yargs.Arguments) {
                value.resolve(args['foo']);
            }
        });
        mnr.setArgs('-f', "bla");
        mnr.initializeCli();
        chai.assert.equal(await value.promise, 'bla');
    });

    it("resolves with default", async () => {
        const value = new Deferred<string>();
        const mnr = new TestCliManager({
            configure(conf: yargs.Argv) {
                conf.option('foo', { alias: 'f', description: 'Some foo.' });
                conf.option('bar', { alias: 'b', description: 'Some bla.', default: 'my-default', type: 'string' });
            },
            setArguments(args: yargs.Arguments) {
                value.resolve(args['bar']);
            }
        });
        mnr.setArgs('--foo');
        mnr.initializeCli();
        chai.assert.equal(await value.promise, 'my-default');
    });

    it("prints help and exits", () =>
        assertExits(() => {
            const mnr = new TestCliManager();
            mnr.setArgs('--help');
            mnr.initializeCli();
        })
    );
});

function assertExits(code: () => void): Promise<void> {
    const oldExit = process.exit;
    const exitCalled = new Deferred<void>();
    const exitError = new Error();
    process.exit = () => {
        throw exitError;
    };
    try {
        code();
        exitCalled.reject();
    } catch (err) {
        if (err === exitError) {
            exitCalled.resolve();
        } else {
            exitCalled.reject();
        }
    } finally {
        process.exit = oldExit;
    }
    return exitCalled.promise;
}
