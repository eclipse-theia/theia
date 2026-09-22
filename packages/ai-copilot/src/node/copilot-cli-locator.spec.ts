// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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
import { promises as fs } from 'fs';
import * as os from 'os';
import { join } from 'path';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { CopilotCliLocator, COPILOT_CLI_PATH_ENV } from './copilot-cli-locator';

class TestableCopilotCliLocator extends CopilotCliLocator {
    constructor() {
        super();
        // The logger is injected in production, and read-only for everyone else.
        Object.assign(this, { logger: new MockLogger() });
    }

    callToPlatformPackageCandidates(base: string): string[] {
        return this.toPlatformPackageCandidates(base);
    }

    callToCandidatesOnPath(target: string): string[] {
        return this.toCandidatesOnPath(target);
    }

    callResolvedCandidates(anchor: string): string[] {
        return this.resolvedCandidates(anchor);
    }

    callGetCliPlatformPackageNames(): string[] {
        return this.getCliPlatformPackageNames();
    }

    callGetBinaryName(): string {
        return this.getBinaryName();
    }

    callEnvironmentCandidates(): Promise<string[]> {
        return this.environmentCandidates();
    }

    callGetCliFileNames(): string[] {
        return this.getCliFileNames();
    }
}

const names = new TestableCopilotCliLocator();
const PLATFORM_PACKAGE = names.callGetCliPlatformPackageNames()[0];
const BINARY_NAME = names.callGetBinaryName();

/**
 * Creates a temporary directory with its symlinks resolved.
 *
 * The locator reports what it found canonicalized, through `fs.realpath` and through the module
 * resolution of Node.js, while the temporary directory is a symlink on macOS.
 */
async function createTempDirectory(prefix: string): Promise<string> {
    return fs.realpath(await fs.mkdtemp(join(os.tmpdir(), prefix)));
}

/**
 * Creates a file that passes the executable check of the locator.
 */
async function writeExecutable(path: string): Promise<string> {
    await fs.mkdir(join(path, '..'), { recursive: true });
    await fs.writeFile(path, '', { mode: 0o755 });
    return path;
}

/**
 * Writes a platform package that points its main entry at the executable, the way the ones published
 * by GitHub do: `@github/copilot-win32-x64` exports `./copilot.exe`, the others `./copilot`.
 */
async function installPlatformPackage(at: string, packageName = PLATFORM_PACKAGE, binaryName = BINARY_NAME): Promise<string> {
    const directory = join(at, ...packageName.split('/'));
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(join(directory, 'package.json'), JSON.stringify({
        name: packageName,
        version: '1.0.0',
        exports: { '.': `./${binaryName}` }
    }));
    return writeExecutable(join(directory, binaryName));
}

/** A locator that looks for what a Windows host has, so that the lookup can be tested from anywhere. */
class WindowsLikeCopilotCliLocator extends TestableCopilotCliLocator {

    static readonly PACKAGE = '@github/copilot-win32-x64';
    static readonly BINARY = 'copilot.exe';

    protected override getBinaryName(): string {
        return WindowsLikeCopilotCliLocator.BINARY;
    }

    protected override getCliPlatformPackageNames(): string[] {
        return [WindowsLikeCopilotCliLocator.PACKAGE];
    }
}

describe('CopilotCliLocator - candidates', () => {

    const locator = new TestableCopilotCliLocator();

    it('should look for the executable of the platform package below a module directory', () => {
        const candidates = locator.callToPlatformPackageCandidates(join('/app', 'node_modules'));
        expect(candidates).to.not.be.empty;
        for (const candidate of candidates) {
            expect(candidate).to.contain(join('node_modules', '@github', 'copilot-'));
            expect(candidate.endsWith(locator.callGetBinaryName())).to.be.true;
        }
    });

    it('should consider the glibc and the musl build on Linux', function (): void {
        if (process.platform !== 'linux') {
            this.skip();
        }
        const candidates = locator.callToPlatformPackageCandidates('/app/node_modules');
        expect(candidates).to.have.lengthOf(2);
        expect(candidates.some(candidate => candidate.includes('copilot-linux-'))).to.be.true;
        expect(candidates.some(candidate => candidate.includes('copilot-linuxmusl-'))).to.be.true;
    });

    it('should return nothing for an empty module directory', () => {
        expect(locator.callToPlatformPackageCandidates('')).to.be.empty;
    });

    it('should map the JavaScript launcher of a global installation to the platform package', () => {
        const launcher = join('/usr', 'lib', 'node_modules', '@github', 'copilot', 'npm-loader.js');
        const candidates = locator.callToCandidatesOnPath(launcher);
        expect(candidates).to.not.be.empty;
        for (const candidate of candidates) {
            expect(candidate).to.contain(join('/usr', 'lib', 'node_modules', '@github', 'copilot-'));
            expect(candidate).to.not.contain('npm-loader.js');
        }
    });

    it('should map the shim of a global installation to the platform package next to it', () => {
        // What a global npm installation on Windows puts into its prefix, instead of a link.
        const candidates = locator.callToCandidatesOnPath(join('/prefix', 'copilot.cmd'));
        expect(candidates).to.not.be.empty;
        for (const candidate of candidates) {
            expect(candidate).to.contain(join('/prefix', 'node_modules', '@github', 'copilot-'));
        }
    });

    it('should take a native executable on the PATH as it is', () => {
        const executable = join('/opt', 'copilot', 'copilot');
        expect(locator.callToCandidatesOnPath(executable)).to.deep.equal([executable]);
    });

    it('should look for the shim of a global installation on Windows, which has no other entry', function (): void {
        if (process.platform !== 'win32') {
            this.skip();
        }
        expect(locator.callGetCliFileNames()).to.deep.equal(['copilot.exe', 'copilot.cmd']);
    });

    it('should look for the executable only where an installation links to it', function (): void {
        if (process.platform === 'win32') {
            this.skip();
        }
        expect(locator.callGetCliFileNames()).to.deep.equal(['copilot']);
    });
});

describe('CopilotCliLocator - installed platform package', () => {

    let root: string;
    let modules: string;
    const locator = new TestableCopilotCliLocator();

    beforeEach(async () => {
        root = await createTempDirectory('theia-copilot-install-');
        modules = join(root, 'node_modules');
        await fs.mkdir(join(modules, '@github', 'copilot'), { recursive: true });
        // The launcher of the CLI is executable, and linked to from the global binary directory.
        await writeExecutable(join(modules, '@github', 'copilot', 'npm-loader.js'));
    });

    afterEach(async () => {
        await fs.rm(root, { recursive: true, force: true });
    });

    it('should find a package that the installation hoisted next to the launcher', async () => {
        const executable = await installPlatformPackage(modules);
        const launcher = join(modules, '@github', 'copilot', 'npm-loader.js');
        expect(locator.callResolvedCandidates(launcher)).to.contain(executable);
        expect(locator.callToCandidatesOnPath(launcher)).to.contain(executable);
    });

    it('should find a package that a global installation nested below the launcher', async () => {
        const executable = await installPlatformPackage(join(modules, '@github', 'copilot', 'node_modules'));
        const launcher = join(modules, '@github', 'copilot', 'npm-loader.js');
        expect(locator.callResolvedCandidates(launcher)).to.contain(executable);
        expect(locator.callToCandidatesOnPath(launcher)).to.contain(executable);
    });

    it('should return nothing when no platform package is installed', () => {
        expect(locator.callResolvedCandidates(join(modules, '@github', 'copilot', 'npm-loader.js'))).to.be.empty;
    });

    it('should find the package of a global installation from the shim next to its module directory', async () => {
        const executable = await installPlatformPackage(join(modules, '@github', 'copilot', 'node_modules'));
        expect(locator.callToCandidatesOnPath(join(root, 'copilot.cmd'))).to.contain(executable);
    });

    it('should reject a configured shim that leads nowhere, since it cannot be spawned', async () => {
        const shim = await writeExecutable(join(root, 'copilot.cmd'));
        const configured = new TestableCopilotCliLocator();
        configured.setConfiguredPath(shim);
        try {
            await configured.resolve();
            expect.fail('should have rejected');
        } catch (error) {
            expect(String(error)).to.contain(shim);
        }
    });

    it('should follow a configured launcher to the executable it would start', async function (): Promise<void> {
        if (process.platform === 'win32') {
            // A global installation writes a shim rather than a link there.
            this.skip();
        }
        const executable = await installPlatformPackage(join(modules, '@github', 'copilot', 'node_modules'));
        const launcher = join(root, 'bin', 'copilot');
        await fs.mkdir(join(root, 'bin'), { recursive: true });
        await fs.symlink(join(modules, '@github', 'copilot', 'npm-loader.js'), launcher);

        const configured = new TestableCopilotCliLocator();
        configured.setConfiguredPath(launcher);
        expect(await configured.resolve()).to.equal(executable);
    });
});

describe('CopilotCliLocator - environment', () => {

    const locator = new TestableCopilotCliLocator();
    const previous = process.env[COPILOT_CLI_PATH_ENV];
    let root: string;

    beforeEach(async () => {
        root = await createTempDirectory('theia-copilot-env-');
    });

    afterEach(async () => {
        if (previous === undefined) {
            delete process.env[COPILOT_CLI_PATH_ENV];
        } else {
            process.env[COPILOT_CLI_PATH_ENV] = previous;
        }
        await fs.rm(root, { recursive: true, force: true });
    });

    it('should honor the location given in the environment', async () => {
        process.env[COPILOT_CLI_PATH_ENV] = '/opt/copilot/copilot';
        expect(await locator.callEnvironmentCandidates()).to.deep.equal(['/opt/copilot/copilot']);
    });

    it('should ignore a blank value', async () => {
        process.env[COPILOT_CLI_PATH_ENV] = '  ';
        expect(await locator.callEnvironmentCandidates()).to.be.empty;
    });

    it('should follow a launcher given in the environment, the way a configured one is followed', async () => {
        const modules = join(root, 'node_modules');
        const executable = await installPlatformPackage(modules);
        const launcher = await writeExecutable(join(modules, '@github', 'copilot', 'npm-loader.js'));
        process.env[COPILOT_CLI_PATH_ENV] = launcher;
        expect(await locator.callEnvironmentCandidates()).to.deep.equal([executable]);
    });

    it('should accept the directory holding the executable', async () => {
        const executable = await writeExecutable(join(root, 'bin', BINARY_NAME));
        process.env[COPILOT_CLI_PATH_ENV] = join(root, 'bin');
        expect(await locator.callEnvironmentCandidates()).to.deep.equal([executable]);
    });

    it('should drop a launcher that leads nowhere instead of offering it for spawning', async () => {
        process.env[COPILOT_CLI_PATH_ENV] = await writeExecutable(join(root, 'copilot.cmd'));
        expect(await locator.callEnvironmentCandidates()).to.be.empty;
    });
});

describe('CopilotCliLocator - configured path', () => {

    let home: string;
    let executable: string;

    beforeEach(async () => {
        home = await createTempDirectory('theia-copilot-locator-');
        executable = await writeExecutable(join(home, 'bin', process.platform === 'win32' ? 'copilot.exe' : 'copilot'));
    });

    afterEach(async () => {
        await fs.rm(home, { recursive: true, force: true });
    });

    it('should use the configured executable', async () => {
        const locator = new TestableCopilotCliLocator();
        locator.setConfiguredPath(executable);
        expect(await locator.resolve()).to.equal(executable);
    });

    it('should accept the directory holding the executable', async () => {
        const locator = new TestableCopilotCliLocator();
        locator.setConfiguredPath(join(home, 'bin'));
        expect(await locator.resolve()).to.equal(executable);
    });

    it('should report a configured location that does not exist', async () => {
        const locator = new TestableCopilotCliLocator();
        const missing = join(home, 'nowhere', 'copilot');
        locator.setConfiguredPath(missing);
        try {
            await locator.resolve();
            expect.fail('should have rejected');
        } catch (error) {
            expect(String(error)).to.contain(missing);
        }
    });

    it('should search again after the configured location changed', async () => {
        const locator = new TestableCopilotCliLocator();
        locator.setConfiguredPath(join(home, 'nowhere', 'copilot'));
        await locator.resolve().catch(() => { /* expected */ });
        locator.setConfiguredPath(executable);
        expect(await locator.resolve()).to.equal(executable);
    });
});

describe('CopilotCliLocator - a Windows host', () => {

    let root: string;
    const locator = new WindowsLikeCopilotCliLocator();

    beforeEach(async () => {
        root = await createTempDirectory('theia-copilot-windows-');
    });

    afterEach(async () => {
        await fs.rm(root, { recursive: true, force: true });
    });

    /**
     * Writes what a global npm installation leaves on Windows: a `copilot.cmd` shim in the prefix, and
     * the platform package nested below the launcher, exporting its executable under the `.exe` name.
     */
    async function installGlobally(): Promise<{ shim: string, executable: string }> {
        const modules = join(root, 'node_modules');
        await writeExecutable(join(modules, '@github', 'copilot', 'npm-loader.js'));
        const executable = await installPlatformPackage(
            join(modules, '@github', 'copilot', 'node_modules'),
            WindowsLikeCopilotCliLocator.PACKAGE,
            WindowsLikeCopilotCliLocator.BINARY
        );
        return { shim: await writeExecutable(join(root, 'copilot.cmd')), executable };
    }

    it('should follow the shim of a global installation to the executable', async () => {
        const { shim, executable } = await installGlobally();
        expect(locator.callToCandidatesOnPath(shim)).to.contain(executable);
    });

    it('should follow a configured shim to the executable, which is what can be spawned', async () => {
        const { shim, executable } = await installGlobally();
        locator.setConfiguredPath(shim);
        try {
            expect(await locator.resolve()).to.equal(executable);
        } finally {
            locator.setConfiguredPath(undefined);
        }
    });
});
