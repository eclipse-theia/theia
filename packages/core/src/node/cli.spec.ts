// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import * as yargs from 'yargs';
import * as chai from 'chai';
import { CliManager, CliContribution } from './cli';
import { Deferred } from '../common/promise-util';
import { MaybePromise } from '../common/types';

class TestCliManager extends CliManager {
    constructor(...contribs: CliContribution[]) {
        super({
            getContributions(): CliContribution[] { return contribs; }
        });
    }
}

beforeEach(() => {
    yargs.global([]);
});

describe('CliManager', () => {
    it('Parses simple option', async () => {
        const value = new Deferred<string>();
        const manager = new TestCliManager({
            configure(conf: yargs.Argv): void {
                conf.option('foo', { alias: 'f', description: 'Some foo.' });
                conf.option('bar', { alias: 'b', description: 'Some bla.', default: 'my-default', type: 'string' });
            },
            setArguments(args: yargs.Arguments): void {
                value.resolve(args['foo'] as string);
            }
        });
        await manager.initializeCli(['-f', 'bla']);
        chai.assert.equal(await value.promise, 'bla');
    });

    it('resolves with default', async () => {
        const value = new Deferred<string>();
        const manager = new TestCliManager({
            configure(conf: yargs.Argv): void {
                conf.option('foo', { alias: 'f', description: 'Some foo.' });
                conf.option('bar', { alias: 'b', description: 'Some bla.', default: 'my-default', type: 'string' });
            },
            setArguments(args: yargs.Arguments): MaybePromise<void> {
                value.resolve(args['bar'] as string);
            }
        });
        await manager.initializeCli(['--foo']);
        chai.assert.equal(await value.promise, 'my-default');
    });

    it('prints help and exits', async () =>
        assertExits(async () => {
            const manager = new TestCliManager();
            await manager.initializeCli(['--help']);
        })
    );
});

async function assertExits(code: () => Promise<void>): Promise<void> {
    const oldExit = process.exit;
    const exitCalled = new Deferred<void>();
    const exitError = new Error();
    process.exit = () => {
        throw exitError;
    };
    try {
        await code();
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
