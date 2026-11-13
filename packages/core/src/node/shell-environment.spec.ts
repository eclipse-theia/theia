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
import { ChildProcess } from 'child_process';
import { Container } from 'inversify';
import { ILogger } from '../common/logger.js';
import { Stopwatch } from '../common/performance/index.js';
import { ShellEnvironmentResolutionTimeout } from '../common/shell-environment.js';
import { MockLogger } from '../common/test/mock-logger.js';
import { NodeStopwatch } from './performance/node-stopwatch.js';
import { SettingService } from './setting-service.js';
import { ShellEnvironmentServerImpl } from './shell-environment.js';

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
class TestShellEnvironment extends ShellEnvironmentServerImpl {
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

    /** The environment that was handed over to be applied. */
    applied: NodeJS.ProcessEnv | undefined;

    protected override apply(env: NodeJS.ProcessEnv): void {
        this.applied = env;
        super.apply(env);
    }

    /** How often the login shell was killed. */
    kills = 0;

    protected override kill(child: ChildProcess): void {
        this.kills++;
        super.kill(child);
    }

    /** Settles once the login shell is running. */
    async whenShellStarted(): Promise<void> {
        while (!this.shell) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }
}

/** The service with the shell arguments exposed. */
class ExposedShellEnvironment extends ShellEnvironmentServerImpl {
    override getShellArguments(shell: string, mark: string, executable?: string): string[] {
        return super.getShellArguments(shell, mark, executable);
    }
}

describe('ShellEnvironmentServerImpl', () => {

    const prefix = 'THEIA_SHELL_ENVIRONMENT_SPEC_';
    const restored = ['PATH', 'ELECTRON_RUN_AS_NODE', 'THEIA_RESOLVING_ENVIRONMENT', 'DISABLE_AUTO_UPDATE', 'XDG_RUNTIME_DIR', 'DEBUG'];
    let original: Map<string, string | undefined>;

    /** The script writes the given JSON source between the markers, with what dotfiles might print around it. */
    const printing = (json: string) => `process.stdout.write('Welcome!\\n' + process.argv[1] + JSON.stringify(${json}) + process.argv[1] + '\\nbye\\n')`;

    /** The script starts a detached program that inherits the stdout of the "shell" and keeps it open for four seconds. */
    const backgroundJob = "require('child_process').spawn(process.execPath, ['-e', 'setTimeout(() => { }, 4000)'], "
        + "{ detached: true, stdio: ['ignore', 'inherit', 'ignore'] }).unref();";

    const setup = (script: string, timeout?: string): { environment: TestShellEnvironment, settings: TestSettingService } => {
        const container = new Container({ defaultScope: 'Singleton' });
        container.bind(ILogger).to(MockLogger);
        container.bind(Stopwatch).to(NodeStopwatch);
        container.bind(TestSettingService).toSelf();
        container.bind(SettingService).toService(TestSettingService);
        container.bind(TestShellEnvironment).toSelf();
        container.bind(ShellEnvironmentServerImpl).toSelf();
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

    it('applies the PATH that the login shell prints, ignoring what its configuration prints around it', async () => {
        const { environment } = setup(printing("{ PATH: '/login/bin:/usr/bin' }"));
        expect(await environment.whenResolved()).to.deep.equal({ status: 'applied' });
        expect(process.env.PATH).to.equal('/login/bin:/usr/bin');
    });

    it('runs the login shell with a variable that tells the shell configuration that the environment is being resolved', async () => {
        const { environment } = setup(printing("{ PATH: '/resolving/' + process.env.THEIA_RESOLVING_ENVIRONMENT }"));
        expect(await environment.whenResolved()).to.deep.equal({ status: 'applied' });
        expect(process.env.PATH).to.equal('/resolving/1');
    });

    it('applies no variable of the login shell but PATH', async () => {
        const { environment } = setup(printing(`{
            PATH: '/login/bin', ${prefix}VARIABLE: 'from the shell',
            ELECTRON_RUN_AS_NODE: process.env.ELECTRON_RUN_AS_NODE, THEIA_RESOLVING_ENVIRONMENT: '1',
            DISABLE_AUTO_UPDATE: 'true', XDG_RUNTIME_DIR: '/run/user/login', DEBUG: '*'
        }`));
        expect(await environment.whenResolved()).to.deep.equal({ status: 'applied' });
        expect(process.env.PATH).to.equal('/login/bin');
        expect(process.env[`${prefix}VARIABLE`]).to.be.undefined;
        for (const key of restored.filter(variable => variable !== 'PATH')) {
            expect(process.env[key], key).to.equal(original.get(key));
        }
    });

    it('hands over the environment of the login shell without the variables that were set for the resolution', async () => {
        process.env.DISABLE_AUTO_UPDATE = 'backend';
        const { environment } = setup(printing(`{ ...process.env, PATH: '/login/bin', ${prefix}VARIABLE: 'from the shell' }`));
        expect(await environment.whenResolved()).to.deep.equal({ status: 'applied' });
        expect(environment.applied).to.include({ PATH: '/login/bin', [`${prefix}VARIABLE`]: 'from the shell' });
        for (const key of ['ELECTRON_RUN_AS_NODE', 'ELECTRON_NO_ATTACH_CONSOLE', 'THEIA_RESOLVING_ENVIRONMENT',
            'DISABLE_AUTO_UPDATE', 'ZSH_TMUX_AUTOSTART', 'ZSH_TMUX_AUTOSTARTED']) {
            expect(environment.applied![key], key).to.equal(process.env[key]);
        }
    });

    it('reports a login shell environment that defines no PATH', async () => {
        const { environment } = setup(printing(`{ ${prefix}VARIABLE: 'from the shell' }`));
        const resolution = await environment.whenResolved();
        expect(resolution.status).to.equal('failed');
        expect(resolution.reason).to.contain('does not define PATH');
        expect(process.env.PATH).to.equal(original.get('PATH'));
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
        // the detached program escapes the killing of the shell's process group and keeps the pipe open
        const { environment } = setup(backgroundJob + 'setInterval(() => { }, 1000)', '1');
        const start = Date.now();
        expect(await environment.whenResolved()).to.deep.equal({ status: 'timeout' });
        expect(Date.now() - start).to.be.at.most(2500);
    });

    it('applies the environment once the login shell has exited, even if a program that it started keeps the output open', async function (): Promise<void> {
        this.timeout(10_000);
        const { environment } = setup(backgroundJob + printing("{ PATH: '/background/job' }"), '3');
        const start = Date.now();
        expect(await environment.whenResolved()).to.deep.equal({ status: 'applied' });
        expect(Date.now() - start).to.be.at.most(2000);
        expect(process.env.PATH).to.equal('/background/job');
    });

    it('reports a login shell that exits without printing its environment while a program that it started keeps the output open',
        async function (): Promise<void> {
            this.timeout(10_000);
            const { environment } = setup(backgroundJob, '1');
            const resolution = await environment.whenResolved();
            expect(resolution.status).to.equal('failed');
            expect(resolution.reason).to.contain('did not print its environment');
        });

    it('applies the environment that the login shell printed, even if it does not exit within the timeout', async function (): Promise<void> {
        this.timeout(10_000);
        const { environment } = setup(printing("{ PATH: '/hanging/shell' }") + '; setInterval(() => { }, 1000)', '1');
        expect(await environment.whenResolved()).to.deep.equal({ status: 'applied' });
        expect(process.env.PATH).to.equal('/hanging/shell');
    });

    it('kills a login shell that is still running when the backend stops', async function (): Promise<void> {
        this.timeout(10_000);
        const { environment } = setup('setInterval(() => { }, 1000)', '8');
        const start = Date.now();
        const resolved = environment.whenResolved();
        await environment.whenShellStarted();
        environment.onStop();
        const resolution = await resolved;
        expect(resolution.status).to.equal('failed');
        // SIGKILL for its process group, or SIGTERM on Windows, where there is none and any signal ends the process
        expect(resolution.reason).to.contain('exited with signal');
        expect(Date.now() - start).to.be.at.most(5000);
    });

    it('kills nothing when the backend stops after the login shell has exited', async function (): Promise<void> {
        this.timeout(10_000);
        // the program that the shell configuration started is still running
        const { environment } = setup(backgroundJob + printing("{ PATH: '/exited' }"), '3');
        expect(await environment.whenResolved()).to.deep.equal({ status: 'applied' });
        environment.onStop();
        expect(environment.kills).to.equal(0);
    });

    it('settles with the default timeout when the stored timeout cannot be read', async () => {
        const { environment, settings } = setup(printing("{ PATH: '/default/timeout' }"));
        settings.get = async () => { throw new Error('The settings cannot be read'); };
        expect(await environment.whenResolved()).to.deep.equal({ status: 'applied' });
        expect(process.env.PATH).to.equal('/default/timeout');
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
        const { environment } = setup(printing("{ PATH: '/once' }"));
        environment.initialize();
        const first = environment.whenResolved();
        expect(environment.whenResolved()).to.equal(first);
        expect(await first).to.deep.equal({ status: 'applied' });
        process.env.PATH = '/changed';
        expect(await environment.whenResolved()).to.deep.equal({ status: 'applied' });
        expect(process.env.PATH).to.equal('/changed');
    });

    it('skips the resolution where it does not apply', async () => {
        const { environment } = setup('');
        const container = new Container();
        container.bind(ILogger).to(MockLogger);
        container.bind(Stopwatch).to(NodeStopwatch);
        container.bind(SettingService).toConstantValue(new TestSettingService());
        container.bind(ShellEnvironmentServerImpl).toSelf();
        const unmodified = container.get(ShellEnvironmentServerImpl);
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
            container.bind(ShellEnvironmentServerImpl).toSelf();
            const resolution = await container.get(ShellEnvironmentServerImpl).whenResolved();
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
        for (const pwsh of ['/usr/local/bin/pwsh', '/usr/local/bin/pwsh-preview', '/usr/bin/powershell']) {
            const powershell = environment.getShellArguments(pwsh, mark);
            expect(powershell.slice(0, 2), pwsh).to.deep.equal(['-Login', '-Command']);
            expect(powershell[2], pwsh).to.contain(process.execPath).and.to.contain(`''${mark}''`);
        }
        const nu = environment.getShellArguments('/opt/homebrew/bin/nu', mark);
        expect(nu.slice(0, 3)).to.deep.equal(['-i', '-l', '-c']);
        expect(nu[3]).to.contain(`^'${process.execPath}' -p`).and.to.contain(`"${mark}" + JSON.stringify(process.env) + "${mark}"`);
        const xonsh = environment.getShellArguments('/usr/bin/xonsh', mark);
        expect(xonsh).to.deep.equal(['-i', '-l', '-c', `import os, json; print("${mark}", json.dumps(dict(os.environ)), "${mark}")`]);
    });

    it('quotes the executable for the shell even if its path contains a single quote', () => {
        const environment = new ExposedShellEnvironment();
        const executable = "/Applications/Theia's IDE.app/Contents/MacOS/Theia";
        const quoted = "'/Applications/Theia'\\''s IDE.app/Contents/MacOS/Theia' -p";
        expect(environment.getShellArguments('/bin/zsh', 'abc123', executable)[3]).to.contain(quoted);
        expect(environment.getShellArguments('/bin/tcsh', 'abc123', executable)[1]).to.contain(quoted);
        expect(environment.getShellArguments('/usr/local/bin/pwsh', 'abc123', executable)[2]).to.contain("& '/Applications/Theia''s IDE.app/Contents/MacOS/Theia' -p");
        expect(environment.getShellArguments('/usr/local/bin/nu', 'abc123', executable)[3]).to.contain('^"/Applications/Theia\'s IDE.app/Contents/MacOS/Theia" -p');
        expect(environment.getShellArguments('/usr/local/bin/nu', 'abc123', '/opt/Theia\'s "IDE"\\theia')[3]).to.contain('^"/opt/Theia\'s \\"IDE\\"\\\\theia" -p');
    });
});
