// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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

import { OS } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { RemotePlatform } from '@theia/core/lib/node/remote/remote-cli-contribution';

export interface RemoteScriptStrategy {
    exec(): string;
    downloadFile(url: string, output: string): string;
    unzip(file: string, directory: string): string;
    mkdir(path: string): string;
    home(): string;
    joinPath(...segments: string[]): string;
    joinScript(...segments: string[]): string;
}

@injectable()
export class RemoteWindowsScriptStrategy implements RemoteScriptStrategy {

    home(): string {
        return 'PowerShell -Command $HOME';
    }

    exec(): string {
        return 'PowerShell -Command';
    }

    downloadFile(url: string, output: string): string {
        return `PowerShell -Command Invoke-WebRequest -Uri "${url}" -OutFile ${output}`;
    }

    unzip(file: string, directory: string): string {
        return `tar -xf "${file}" -C "${directory}"`;
    }

    mkdir(path: string): string {
        return `PowerShell -Command New-Item -Force -itemType Directory -Path "${path}"`;
    }

    joinPath(...segments: string[]): string {
        return segments.join('\\');
    }

    joinScript(...segments: string[]): string {
        return segments.join('\r\n');
    }
}

@injectable()
export class RemotePosixScriptStrategy implements RemoteScriptStrategy {

    home(): string {
        return 'eval echo ~';
    }

    exec(): string {
        return 'sh -c';
    }

    downloadFile(url: string, output: string): string {
        return `
if [ "$(command -v wget)" ]; then
    echo "Downloading using wget"
    wget -O "${output}" "${url}"
elif [ "$(command -v curl)" ]; then
    echo "Downloading using curl"
    curl "${url}" --output "${output}"
else
    echo "Failed to find wget or curl."
    exit 1
fi
`.trim();
    }

    unzip(file: string, directory: string): string {
        return `tar -xf "${file}" -C "${directory}"`;
    }

    mkdir(path: string): string {
        return `mkdir -p "${path}"`;
    }

    joinPath(...segments: string[]): string {
        return segments.join('/');
    }

    joinScript(...segments: string[]): string {
        return segments.join('\n');
    }
}

@injectable()
export class RemoteSetupScriptService {

    @inject(RemoteWindowsScriptStrategy)
    protected windowsStrategy: RemoteWindowsScriptStrategy;

    @inject(RemotePosixScriptStrategy)
    protected posixStrategy: RemotePosixScriptStrategy;

    protected getStrategy(platform: RemotePlatform): RemoteScriptStrategy {
        return platform.os === OS.Type.Windows ? this.windowsStrategy : this.posixStrategy;
    }

    home(platform: RemotePlatform): string {
        return this.getStrategy(platform).home();
    }

    exec(platform: RemotePlatform): string {
        return this.getStrategy(platform).exec();
    }

    downloadFile(platform: RemotePlatform, url: string, output: string): string {
        return this.getStrategy(platform).downloadFile(url, output);
    }

    unzip(platform: RemotePlatform, file: string, directory: string): string {
        return this.getStrategy(platform).unzip(file, directory);
    }

    mkdir(platform: RemotePlatform, path: string): string {
        return this.getStrategy(platform).mkdir(path);
    }

    joinPath(platform: RemotePlatform, ...segments: string[]): string {
        return this.getStrategy(platform).joinPath(...segments);
    }

    joinScript(platform: RemotePlatform, ...segments: string[]): string {
        return this.getStrategy(platform).joinScript(...segments);
    }
}
