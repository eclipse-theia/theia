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

import { injectable } from '@theia/core/shared/inversify';
import { RemotePlatform } from '@theia/core/lib/node/remote';

@injectable()
export class RemoteSetupScriptService {

    downloadFile(platform: RemotePlatform, url: string, output: string): string {
        if (platform === 'windows') {
            return `Invoke-WebRequest -Uri "${url}" -OutFile ${output}`;
        } else {
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
    }

    unzip(file: string, directory: string): string {
        return `tar -xf "${file}" -C "${directory}"`;
    }

    mkdir(platform: RemotePlatform, path: string): string {
        if (platform === 'windows') {
            return `New-Item -Force -itemType Directory -Path "${path}"`;
        } else {
            return `mkdir -p "${path}"`;
        }
    }

    joinScript(platform: RemotePlatform, ...segments: string[]): string {
        return segments.join(platform === 'windows' ? '\r\n' : '\n');
    }
}
