// *****************************************************************************
// Copyright (C) 2025 STMicroelectronics and others.
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
import { OS } from '@theia/core';
import { cleanTerminalTitle, GeneralShellType, guessShellTypeFromExecutable, looksLikeHostPrompt, looksLikePath, WindowsShellType } from './shell-type';

// Save original environment state
const originalIsWindows = OS.backend.isWindows;

// Helper functions to set test environment
function setWindowsEnvironment(): void {
    Object.defineProperty(OS.backend, 'isWindows', { value: true });
}

function setUnixEnvironment(): void {
    Object.defineProperty(OS.backend, 'isWindows', { value: false });
}

afterEach(() => {
    // Restore original OS.backend.isWindows value after each test
    Object.defineProperty(OS.backend, 'isWindows', { value: originalIsWindows });
});

describe('shell-type', () => {

    describe('cleanTerminalTitle', () => {

        it('should strip noglob prefix', () => {
            expect(cleanTerminalTitle('noglob git log')).to.equal('git');
        });

        it('should strip nocorrect prefix', () => {
            expect(cleanTerminalTitle('nocorrect git status')).to.equal('git');
        });

        it('should strip command prefix', () => {
            expect(cleanTerminalTitle('command ls -la')).to.equal('ls');
        });

        it('should strip builtin prefix', () => {
            expect(cleanTerminalTitle('builtin cd /tmp')).to.equal('cd');
        });

        it('should strip exec prefix', () => {
            expect(cleanTerminalTitle('exec bash')).to.equal('bash');
        });

        it('should strip multiple prefixes', () => {
            expect(cleanTerminalTitle('noglob command git push')).to.equal('git');
        });

        it('should extract basename from path-based commands', () => {
            expect(cleanTerminalTitle('/usr/bin/git log')).to.equal('git');
        });

        it('should return command name for simple commands', () => {
            expect(cleanTerminalTitle('git')).to.equal('git');
        });

        it('should return command name when arguments are present', () => {
            expect(cleanTerminalTitle('npm install --save')).to.equal('npm');
        });

        it('should handle leading/trailing whitespace', () => {
            expect(cleanTerminalTitle('  git log  ')).to.equal('git');
        });

        it('should return original title for empty string', () => {
            expect(cleanTerminalTitle('')).to.equal('');
        });

        it('should return original title for whitespace-only string', () => {
            expect(cleanTerminalTitle('   ')).to.equal('   ');
        });

        it('should handle zsh-style noglob with complex commands', () => {
            expect(cleanTerminalTitle('noglob git log --oneline --graph')).to.equal('git');
        });

        describe('CWD/prompt detection (returns empty string)', () => {

            it('should return empty for absolute CWD path', () => {
                expect(cleanTerminalTitle('/home/user/project')).to.equal('');
            });

            it('should return empty for home-relative CWD path', () => {
                expect(cleanTerminalTitle('~/Git/theia')).to.equal('');
            });

            it('should return empty for user@host:path format', () => {
                expect(cleanTerminalTitle('user@host:~/Git/theia')).to.equal('');
            });

            it('should return empty for user@host: path format with space', () => {
                expect(cleanTerminalTitle('user@myhost: ~/Git/theia')).to.equal('');
            });

            it('should return empty for cwd-relative path', () => {
                expect(cleanTerminalTitle('./some/dir')).to.equal('');
            });
        });

        it('should extract basename from path-based commands with arguments', () => {
            expect(cleanTerminalTitle('/usr/bin/git log')).to.equal('git');
        });
    });

    describe('looksLikeHostPrompt', () => {

        it('should detect user@host:path format', () => {
            expect(looksLikeHostPrompt('user@host:~/project')).to.be.true;
        });

        it('should detect user@host: path with space', () => {
            expect(looksLikeHostPrompt('user@myhost: ~/Git/theia')).to.be.true;
        });

        it('should not detect plain commands', () => {
            expect(looksLikeHostPrompt('git log')).to.be.false;
        });

        it('should not detect bare paths', () => {
            expect(looksLikeHostPrompt('/home/user/project')).to.be.false;
        });
    });

    describe('looksLikePath', () => {

        it('should detect absolute paths', () => {
            expect(looksLikePath('/home/user/project')).to.be.true;
        });

        it('should detect home-relative paths', () => {
            expect(looksLikePath('~/Git/theia')).to.be.true;
        });

        it('should detect cwd-relative paths', () => {
            expect(looksLikePath('./some/dir')).to.be.true;
        });

        it('should not detect plain commands', () => {
            expect(looksLikePath('git log')).to.be.false;
        });

        it('should not detect simple command names', () => {
            expect(looksLikePath('npm')).to.be.false;
        });
    });

    describe('guessShellTypeFromExecutable', () => {

        it('should return undefined for undefined input', () => {
            expect(guessShellTypeFromExecutable(undefined)).to.be.undefined;
        });

        describe('Windows environment', () => {
            beforeEach(() => {
                setWindowsEnvironment();
            });

            it('should detect cmd.exe as Command Prompt', () => {
                expect(guessShellTypeFromExecutable('C:/Windows/System32/cmd.exe')).to.equal(WindowsShellType.CommandPrompt);
            });

            it('should detect relative cmd.exe path as Command Prompt', () => {
                expect(guessShellTypeFromExecutable('cmd.exe')).to.equal(WindowsShellType.CommandPrompt);
            });

            it('should detect bash.exe as Git Bash in Windows', () => {
                expect(guessShellTypeFromExecutable('C:/Program Files/Git/bin/bash.exe')).to.equal(WindowsShellType.GitBash);
            });

            it('should detect wsl.exe as WSL', () => {
                expect(guessShellTypeFromExecutable('C:/Windows/System32/wsl.exe')).to.equal(WindowsShellType.Wsl);
            });

            it('should detect powershell.exe as PowerShell', () => {
                expect(guessShellTypeFromExecutable('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe')).to.equal(GeneralShellType.PowerShell);
            });

            it('should detect pwsh.exe as PowerShell', () => {
                expect(guessShellTypeFromExecutable('C:/Program Files/PowerShell/7/pwsh.exe')).to.equal(GeneralShellType.PowerShell);
            });

            it('should detect pwsh-preview.exe as PowerShell', () => {
                expect(guessShellTypeFromExecutable('C:/Program Files/PowerShell/7-preview/pwsh-preview.exe')).to.equal(GeneralShellType.PowerShell);
            });

            it('should detect python.exe as Python', () => {
                expect(guessShellTypeFromExecutable('C:/Python310/python.exe')).to.equal(GeneralShellType.Python);
            });

            it('should detect py.exe as Python', () => {
                expect(guessShellTypeFromExecutable('C:/Windows/py.exe')).to.equal(GeneralShellType.Python);
            });

            it('should not detect unknown executable', () => {
                expect(guessShellTypeFromExecutable('C:/Program Files/SomeApp/unknown.exe')).to.be.undefined;
            });
        });

        describe('Linux environment', () => {
            beforeEach(() => {
                setUnixEnvironment();
            });

            it('should detect bash', () => {
                expect(guessShellTypeFromExecutable('/bin/bash')).to.equal(GeneralShellType.Bash);
            });

            it('should detect sh', () => {
                expect(guessShellTypeFromExecutable('/bin/sh')).to.equal(GeneralShellType.Sh);
            });

            it('should detect zsh', () => {
                expect(guessShellTypeFromExecutable('/usr/bin/zsh')).to.equal(GeneralShellType.Zsh);
            });

            it('should detect fish', () => {
                expect(guessShellTypeFromExecutable('/usr/bin/fish')).to.equal(GeneralShellType.Fish);
            });

            it('should detect csh', () => {
                expect(guessShellTypeFromExecutable('/bin/csh')).to.equal(GeneralShellType.Csh);
            });

            it('should detect ksh', () => {
                expect(guessShellTypeFromExecutable('/bin/ksh')).to.equal(GeneralShellType.Ksh);
            });

            it('should detect node', () => {
                expect(guessShellTypeFromExecutable('/usr/bin/node')).to.equal(GeneralShellType.Node);
            });

            it('should detect julia', () => {
                expect(guessShellTypeFromExecutable('/usr/local/bin/julia')).to.equal(GeneralShellType.Julia);
            });

            it('should detect nushell', () => {
                expect(guessShellTypeFromExecutable('/usr/bin/nu')).to.equal(GeneralShellType.NuShell);
            });

            it('should detect pwsh', () => {
                expect(guessShellTypeFromExecutable('/usr/bin/pwsh')).to.equal(GeneralShellType.PowerShell);
            });

            it('should not detect Windows-specific shells', () => {
                expect(guessShellTypeFromExecutable('/usr/bin/cmd')).to.not.equal(WindowsShellType.CommandPrompt);
            });

            it('should not detect unknown executable', () => {
                expect(guessShellTypeFromExecutable('/usr/bin/unknown')).to.be.undefined;
            });
        });

        describe('macOS environment', () => {
            beforeEach(() => {
                setUnixEnvironment(); // macOS is a Unix-based OS
            });

            it('should detect bash', () => {
                expect(guessShellTypeFromExecutable('/bin/bash')).to.equal(GeneralShellType.Bash);
            });

            it('should detect zsh (macOS default)', () => {
                expect(guessShellTypeFromExecutable('/bin/zsh')).to.equal(GeneralShellType.Zsh);
            });

            it('should detect fish from homebrew', () => {
                expect(guessShellTypeFromExecutable('/usr/local/bin/fish')).to.equal(GeneralShellType.Fish);
            });

            it('should detect python from homebrew', () => {
                expect(guessShellTypeFromExecutable('/usr/local/bin/python')).to.equal(GeneralShellType.Python);
            });

            it('should detect python3', () => {
                expect(guessShellTypeFromExecutable('/usr/bin/python3')).to.equal(GeneralShellType.Python);
            });

            it('should detect node from homebrew', () => {
                expect(guessShellTypeFromExecutable('/usr/local/bin/node')).to.equal(GeneralShellType.Node);
            });

            it('should not detect Windows-specific shells', () => {
                expect(guessShellTypeFromExecutable('/usr/bin/cmd')).to.not.equal(WindowsShellType.CommandPrompt);
            });

            it('should not detect unknown executable', () => {
                expect(guessShellTypeFromExecutable('/Applications/Unknown.app/Contents/MacOS/Unknown')).to.be.undefined;
            });
        });

        describe('Edge cases', () => {
            it('should handle empty string', () => {
                expect(guessShellTypeFromExecutable('')).to.be.undefined;
            });

            it('should handle executable with spaces in Windows', () => {
                setWindowsEnvironment();
                expect(guessShellTypeFromExecutable('C:/Program Files/PowerShell/7/pwsh.exe')).to.equal(GeneralShellType.PowerShell);
            });

            it('should ignore case in Unix paths (which is not standard but handles user input errors)', () => {
                setUnixEnvironment();
                expect(guessShellTypeFromExecutable('/usr/bin/BASH')).to.be.undefined;
            });
        });
    });
});
