// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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

import { expect } from 'chai';
import { Container } from 'inversify';
import { ILogger } from '../common/logger.js';
import { Stopwatch } from '../common/performance/index.js';
import { ShellEnvironmentResolutionTimeout } from '../common/shell-environment.js';
import { MockLogger } from '../common/test/mock-logger.js';
import { NodeStopwatch } from './performance/node-stopwatch.js';
import { SettingService } from './setting-service.js';
import { ShellEnvironmentImpl } from './shell-environment.js';

/** A setting service that keeps its values in memory and counts the writes. */
class TestSettingService implements SettingService {
    readonly values = new Map<string, string>();
    writes = 0;

    async get(key: string): Promise<string | undefined> {
        return this.values.get(key);
    }

    async set(key: string, value: string): Promise<void> {
        this.writes++;
        this.values.set(key, value);
    }
}

/**
 * The service with the login shell replaced by Node running a script, so that the tests run without a shell,
 * and with the resolution enabled, which it is not where the tests run.
 */
class TestShellEnvironment extends ShellEnvironmentImpl {
    /** The script to run in place of the login shell's command. Its first argument is the marker. */
    script = '';

    protected override getSkipReason(): string | undefined {
        return undefined;
    }

    protected override getLoginShell(): string {
        return process.execPath;
    }

    protected override getShellArguments(shell: string, mark: string): string[] {
        return ['-e', this.script, mark];
    }

    override getResolutionTimeout(): Promise<number> {
        return super.getResolutionTimeout();
    }
}

/** The service with the shell arguments exposed. */
class ExposedShellEnvironment extends ShellEnvironmentImpl {
    override getShellArguments(shell: string, mark: string, executable?: string): string[] {
        return super.getShellArguments(shell, mark, executable);
    }
}

describe('ShellEnvironmentImpl', () => {

    const prefix = 'THEIA_SHELL_ENVIRONMENT_SPEC_';
    const restored = ['ELECTRON_RUN_AS_NODE', 'THEIA_RESOLVING_ENVIRONMENT', 'DISABLE_AUTO_UPDATE', 'XDG_RUNTIME_DIR'];
    let original: Map<string, string | undefined>;

    /** The script writes the given JSON source between the markers, with what dotfiles might print around it. */
    const printing = (json: string) => `process.stdout.write('Welcome!\\n' + process.argv[1] + JSON.stringify(${json}) + process.argv[1] + '\\nbye\\n')`;

    const setup = (script: string, timeout?: string): { environment: TestShellEnvironment, settings: TestSettingService } => {
        const container = new Container({ defaultScope: 'Singleton' });
        container.bind(ILogger).to(MockLogger);
        container.bind(Stopwatch).to(NodeStopwatch);
        container.bind(TestSettingService).toSelf();
        container.bind(SettingService).toService(TestSettingService);
        container.bind(TestShellEnvironment).toSelf();
        container.bind(ShellEnvironmentImpl).toSelf();
        const settings = container.get(TestSettingService);
        if (timeout !== undefined) {
            settings.values.set(ShellEnvironmentResolutionTimeout.PREFERENCE, timeout);
        }
        const environment = container.get(TestShellEnvironment);
        environment.script = script;
        return { environment, settings };
    };

    beforeEach(() => {
        original = new Map(restored.map(key => [key, process.env[key]]));
    });

    afterEach(() => {
        for (const key of Object.keys(process.env)) {
            if (key.startsWith(prefix)) {
                delete process.env[key];
            }
        }
        for (const [key, value] of original) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    });

    it('applies the environment that the login shell prints, ignoring what its configuration prints around it', async () => {
        const { environment } = setup(printing(`{ ${prefix}VARIABLE: 'from the shell', ${prefix}RESOLVING: process.env.THEIA_RESOLVING_ENVIRONMENT }`));
        expect(await environment.whenResolved()).to.deep.equal({ status: 'applied' });
        expect(process.env[`${prefix}VARIABLE`]).to.equal('from the shell');
        // the shell configuration can tell the resolution from a terminal session
        expect(process.env[`${prefix}RESOLVING`]).to.equal('1');
    });

    it('does not apply the variables added for the resolution nor the runtime directory of the login session', async () => {
        const { environment } = setup(printing(`{
            ELECTRON_RUN_AS_NODE: process.env.ELECTRON_RUN_AS_NODE, THEIA_RESOLVING_ENVIRONMENT: '1',
            DISABLE_AUTO_UPDATE: 'true', XDG_RUNTIME_DIR: '/run/user/login'
        }`));
        expect(await environment.whenResolved()).to.deep.equal({ status: 'applied' });
        for (const key of restored) {
            expect(process.env[key], key).to.equal(original.get(key));
        }
    });

    it('gives up on a login shell that does not answer within the timeout', async function (): Promise<void> {
        this.timeout(10_000);
        const { environment } = setup('setInterval(() => { }, 1000)', '1');
        const start = Date.now();
        expect(await environment.whenResolved()).to.deep.equal({ status: 'timeout' });
        const elapsed = Date.now() - start;
        expect(elapsed).to.be.at.least(900).and.at.most(5000);
    });

    it('gives up at the timeout even if a program started by the shell configuration keeps the output open', async function (): Promise<void> {
        this.timeout(10_000);
        // the "shell" starts a detached program that inherits its stdout and exits; the pipe stays open until that program ends
        const script = "require('child_process').spawn(process.execPath, ['-e', 'setTimeout(() => { }, 4000)'], "
            + "{ detached: true, stdio: ['ignore', 'inherit', 'ignore'] }).unref()";
        const { environment } = setup(script, '1');
        const start = Date.now();
        expect(await environment.whenResolved()).to.deep.equal({ status: 'timeout' });
        expect(Date.now() - start).to.be.at.most(2500);
    });

    it('settles with the default timeout when the stored timeout cannot be read', async () => {
        const { environment, settings } = setup(printing(`{ ${prefix}DEFAULT: 'yes' }`));
        settings.get = async () => { throw new Error('The settings cannot be read'); };
        expect(await environment.whenResolved()).to.deep.equal({ status: 'applied' });
        expect(process.env[`${prefix}DEFAULT`]).to.equal('yes');
    });

    it('reports a login shell that fails', async () => {
        const { environment } = setup('process.exit(3)');
        const resolution = await environment.whenResolved();
        expect(resolution.status).to.equal('failed');
        expect(resolution.reason).to.contain('code 3');
    });

    it('reports a login shell that does not print its environment', async () => {
        const { environment } = setup("process.stdout.write('nothing to see')");
        const resolution = await environment.whenResolved();
        expect(resolution.status).to.equal('failed');
        expect(resolution.reason).to.contain('did not print its environment');
    });

    it('reports an environment that cannot be parsed', async () => {
        const { environment } = setup("process.stdout.write(process.argv[1] + '{' + process.argv[1])");
        const resolution = await environment.whenResolved();
        expect(resolution.status).to.equal('failed');
        expect(resolution.reason).to.contain('could not be parsed');
    });

    it('resolves once and shares the outcome', async () => {
        const { environment } = setup(printing(`{ ${prefix}ONCE: 'once' }`));
        environment.initialize();
        const first = environment.whenResolved();
        expect(environment.whenResolved()).to.equal(first);
        expect(await first).to.deep.equal({ status: 'applied' });
        delete process.env[`${prefix}ONCE`];
        expect(await environment.whenResolved()).to.deep.equal({ status: 'applied' });
        expect(process.env[`${prefix}ONCE`]).to.be.undefined;
    });

    it('skips the resolution where it does not apply', async () => {
        const { environment } = setup('');
        const container = new Container();
        container.bind(ILogger).to(MockLogger);
        container.bind(Stopwatch).to(NodeStopwatch);
        container.bind(SettingService).toConstantValue(new TestSettingService());
        container.bind(ShellEnvironmentImpl).toSelf();
        const unmodified = container.get(ShellEnvironmentImpl);
        const resolution = await unmodified.whenResolved();
        expect(resolution.status).to.equal('skipped');
        expect(resolution.reason).to.match(process.platform === 'win32' ? /Windows/ : /Electron/);
        expect(await environment.getResolutionTimeout()).to.equal(ShellEnvironmentResolutionTimeout.DEFAULT);
    });

    it('skips the resolution in a backend that the login shell being resolved has started', async function (): Promise<void> {
        if (process.platform === 'win32') {
            this.skip();
        }
        const versions = process.versions as { electron?: string };
        const electron = versions.electron;
        versions.electron = electron ?? '0.0.0-test';
        process.env.THEIA_RESOLVING_ENVIRONMENT = '1';
        try {
            const container = new Container();
            container.bind(ILogger).to(MockLogger);
            container.bind(Stopwatch).to(NodeStopwatch);
            container.bind(SettingService).toConstantValue(new TestSettingService());
            container.bind(ShellEnvironmentImpl).toSelf();
            const resolution = await container.get(ShellEnvironmentImpl).whenResolved();
            expect(resolution.status).to.equal('skipped');
            expect(resolution.reason).to.contain('login shell');
        } finally {
            if (electron === undefined) {
                delete versions.electron;
            } else {
                versions.electron = electron;
            }
        }
    });

    it('uses the stored resolution timeout within its bounds', async () => {
        const timeout = (stored?: string) => setup('', stored).environment.getResolutionTimeout();
        expect(await timeout()).to.equal(10);
        expect(await timeout('')).to.equal(10);
        expect(await timeout('soon')).to.equal(10);
        expect(await timeout('30')).to.equal(30);
        expect(await timeout('0')).to.equal(1);
        expect(await timeout('300')).to.equal(120);
    });

    it('stores the resolution timeout for the next start when it changes', async () => {
        const { environment, settings } = setup('');
        await environment.setResolutionTimeout(30);
        expect(settings.values.get(ShellEnvironmentResolutionTimeout.PREFERENCE)).to.equal('30');
        await environment.setResolutionTimeout(30);
        expect(settings.writes).to.equal(1);
        await environment.setResolutionTimeout(undefined);
        expect(settings.values.get(ShellEnvironmentResolutionTimeout.PREFERENCE)).to.equal('');
        await environment.setResolutionTimeout(undefined);
        expect(settings.writes).to.equal(2);
    });

    it('runs the login shell interactively and as a login shell, printing the environment with this executable', () => {
        const environment = new ExposedShellEnvironment();
        const mark = 'abc123';
        const posix = environment.getShellArguments('/bin/zsh', mark);
        expect(posix.slice(0, 3)).to.deep.equal(['-i', '-l', '-c']);
        expect(posix[3]).to.contain(process.execPath).and.to.contain(`"${mark}" + JSON.stringify(process.env) + "${mark}"`);
        expect(environment.getShellArguments('/bin/tcsh', mark).slice(0, 1)).to.deep.equal(['-ic']);
        const powershell = environment.getShellArguments('/usr/local/bin/pwsh', mark);
        expect(powershell.slice(0, 2)).to.deep.equal(['-Login', '-Command']);
        expect(powershell[2]).to.contain(process.execPath).and.to.contain(`''${mark}''`);
    });

    it('quotes the executable for the shell even if its path contains a single quote', () => {
        const environment = new ExposedShellEnvironment();
        const executable = "/Applications/Theia's IDE.app/Contents/MacOS/Theia";
        const quoted = "'/Applications/Theia'\\''s IDE.app/Contents/MacOS/Theia' -p";
        expect(environment.getShellArguments('/bin/zsh', 'abc123', executable)[3]).to.contain(quoted);
        expect(environment.getShellArguments('/bin/tcsh', 'abc123', executable)[1]).to.contain(quoted);
        expect(environment.getShellArguments('/usr/local/bin/pwsh', 'abc123', executable)[2]).to.contain("& '/Applications/Theia''s IDE.app/Contents/MacOS/Theia' -p");
    });
});
