/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import * as path from 'path';
import * as theia from '@theia/plugin';
import { PlatformSpecificAdapterContribution, PluginPackageDebuggersContribution } from '../../../common';
import { isWindows, isOSX } from '@theia/core/lib/common/os';

/**
 * Resolves [DebugAdapterExecutable](#DebugAdapterExecutable) based on contribution.
 */
export async function resolveDebugAdapterExecutable(
    pluginPath: string, debuggerContribution: PluginPackageDebuggersContribution): Promise<theia.DebugAdapterExecutable | undefined> {
    const info = toPlatformInfo(debuggerContribution);
    let program = (info && info.program || debuggerContribution.program);
    if (!program) {
        return undefined;
    }
    program = path.join(pluginPath, program);
    const programArgs = info && info.args || debuggerContribution.args || [];
    let runtime = info && info.runtime || debuggerContribution.runtime;
    if (runtime && runtime.indexOf('./') === 0) {
        runtime = path.join(pluginPath, runtime);
    }
    const runtimeArgs = info && info.runtimeArgs || debuggerContribution.runtimeArgs || [];
    const command = runtime ? runtime : program;
    const args = runtime ? [...runtimeArgs, program, ...programArgs] : programArgs;
    return {
        command,
        args
    };
}

function toPlatformInfo(executable: PluginPackageDebuggersContribution): PlatformSpecificAdapterContribution | undefined {
    if (isWindows && !process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432')) {
        return executable.winx86 || executable.win || executable.windows;
    }
    if (isWindows) {
        return executable.win || executable.windows;
    }
    if (isOSX) {
        return executable.osx;
    }
    return executable.linux;
}
