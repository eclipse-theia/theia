/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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

const path = require('path');
const packageJson = require('../../../package.json');
const debugAdapterDir = packageJson['debugAdapter']['dir'];

import { injectable } from 'inversify';
import { DebugConfiguration } from '@theia/debug/lib/common/debug-common';
import { DebugAdapterContribution, DebugAdapterExecutable } from '@theia/debug/lib/node/debug-model';
import * as Ajv from 'ajv';

export const CppDebugConfigurationSchema = require('../../../data/cpp-debug-configuration-schema.json');
export namespace cppDebugConfigurationValidators {
    export const Launch = new Ajv().compile(CppDebugConfigurationSchema['launch']);
    export const Attach = new Ajv().compile(CppDebugConfigurationSchema['attach']);
}

@injectable()
export class GdbDebugAdapterContribution implements DebugAdapterContribution {

    readonly debugType = 'gdb';
    readonly filePatterns = [
        '[.]c$',
        '[.]cpp$',
        '[.]d$',
        '[.]objective-c$',
        '[.]fortran$',
        '[.]fortran-modern$',
        '[.]fortran90$',
        '[.]fortran_free-form$',
        '[.]fortran_fixed-form$',
        '[.]rust$',
        '[.]pascal$',
        '[.]objectpascal$',
        '[.]ada$',
        '[.]nim$',
        '[.]arm$',
        '[.]asm$',
        '[.]vala$',
        '[.]crystal$',
    ];

    provideDebugConfigurations = [
        {
            type: 'gdb',
            request: 'launch',
            name: 'Launch Program',
            target: './bin/executable',
            cwd: '${workspaceFolder}',
            valuesFormatting: 'parseText'
        },
        {
            type: 'gdb',
            request: 'attach',
            name: 'Attach to PID',
            target: '${pid}',
            cwd: '${workspaceFolder}',
            valuesFormatting: 'parseText'
        },
        {
            type: 'gdb',
            request: 'attach',
            name: 'Attach to gdbserver',
            executable: './bin/executable',
            target: ':2345',
            remote: true,
            cwd: '${workspaceFolder}',
            valuesFormatting: 'parseText'
        },
        {
            type: 'gdb',
            request: 'launch',
            name: 'Launch Program (SSH)',
            target: '/bin/executable',
            cwd: '${workspaceFolder}',
            ssh: {
                host: '127.0.0.1',
                cwd: '/home/remote_user/project/',
                keyfile: '/home/my_user/.ssh/id_rsa',
                user: 'remote_user'
            }
        },
        {
            type: 'gdb',
            request: 'launch',
            name: 'Launch Program (SSH + X11)',
            target: './bin/executable',
            cwd: '${workspaceFolder}',
            ssh: {
                host: '127.0.0.1',
                cwd: '/home/remote_user/project/',
                keyfile: 'home/my_user/.ssh/id_rsa',
                user: 'remote_user',
                forwardX11: true,
                x11host: 'localhost',
                x11port: 6000
            }
        },
        {
            type: 'gdb',
            request: 'launch',
            name: 'Debug Microcontroller',
            target: 'extended-remote /dev/cu.usbmodem00000000',
            executable: './bin/executable.elf',
            cwd: '${workspaceFolder}',
            autorun: [
                'monitor tpwr enable',
                'monitor swdp_scan',
                'attach 1',
                'load ./bin/executable.elf'
            ]
        }
    ];

    resolveDebugConfiguration(config: DebugConfiguration): DebugConfiguration {

        switch (config.request) {
            case 'launch': return this.validateConfiguration(cppDebugConfigurationValidators.Launch, config);
            case 'attach': return this.validateConfiguration(cppDebugConfigurationValidators.Attach, config);
        }

        throw new Error(`unknown request: "${config.request}"`);
    }

    protected validateConfiguration(validator: Ajv.ValidateFunction, config: DebugConfiguration): DebugConfiguration {
        if (!validator(config)) {
            throw new Error(validator.errors!.map(e => e.message).join(' // '));
        }
        return config;
    }

    provideDebugAdapterExecutable(config: DebugConfiguration): DebugAdapterExecutable {
        const program = path.join(__dirname, `../../../${debugAdapterDir}/out/src/gdb.js`);
        return {
            program,
            runtime: 'node',
        };
    }
}
