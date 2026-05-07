// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
import { RemotePlatform } from '@theia/core/lib/node/remote/remote-cli-contribution';
import { AppNativeDependencyContribution } from './app-native-dependency-contribution';

class TestableAppNativeDependencyContribution extends AppNativeDependencyContribution {
    publicGetDefaultURLForFile(remotePlatform: RemotePlatform, theiaVersion: string): string {
        return this.getDefaultURLForFile(remotePlatform, theiaVersion);
    }
}

describe('AppNativeDependencyContribution', () => {
    const contribution = new TestableAppNativeDependencyContribution();
    const base = 'https://github.com/eclipse-theia/theia/releases/download';

    it('builds stable URLs for linux-x64', () => {
        const url = contribution.publicGetDefaultURLForFile({ os: OS.Type.Linux, arch: 'x64' }, '1.70.2');
        expect(url).to.equal(`${base}/v1.70.2/native-dependencies-linux-x64.zip`);
    });

    it('builds stable URLs for both Mac variants', () => {
        const arm = contribution.publicGetDefaultURLForFile({ os: OS.Type.OSX, arch: 'arm64' }, '1.70.2');
        expect(arm).to.equal(`${base}/v1.70.2/native-dependencies-darwin-arm64.zip`);
        const x64 = contribution.publicGetDefaultURLForFile({ os: OS.Type.OSX, arch: 'x64' }, '1.70.2');
        expect(x64).to.equal(`${base}/v1.70.2/native-dependencies-darwin-x64.zip`);
    });

    it('routes -next. versions to the rolling `next` tag', () => {
        const url = contribution.publicGetDefaultURLForFile({ os: OS.Type.Linux, arch: 'x64' }, '1.71.0-next.28+df29ab0fb');
        expect(url).to.equal(`${base}/next/native-dependencies-linux-x64.zip`);
    });

    it('throws a clear error for unsupported (os, arch) combinations', () => {
        expect(() => contribution.publicGetDefaultURLForFile({ os: OS.Type.Linux, arch: 'arm64' }, '1.70.2'))
            .to.throw(/No prebuilt native dependencies are published/);
        expect(() => contribution.publicGetDefaultURLForFile({ os: OS.Type.Windows, arch: 'arm64' }, '1.70.2'))
            .to.throw(/No prebuilt native dependencies are published/);
    });
});
