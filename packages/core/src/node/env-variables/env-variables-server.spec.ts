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
import { ILogger } from '../../common/logger.js';
import { isWindows } from '../../common/os.js';
import { MockLogger } from '../../common/test/mock-logger.js';
import { EnvVariable } from '../../common/env-variables/index.js';
import { EnvVariablesServerImpl } from './env-variables-server.js';

describe('EnvVariablesServerImpl', () => {

    const variable = 'THEIA_ENV_VARIABLES_SERVER_SPEC';
    // the server reports the names in lower case on Windows, where the environment is case-insensitive
    const name = isWindows ? variable.toLowerCase() : variable;
    let configDir: string | undefined;

    beforeEach(() => {
        configDir = process.env.THEIA_CONFIG_DIR;
        // keeps the server from looking the configuration directory up in the application configuration
        process.env.THEIA_CONFIG_DIR = '/tmp/theia-env-variables-server-spec';
        delete process.env[variable];
    });

    afterEach(() => {
        if (configDir === undefined) {
            delete process.env.THEIA_CONFIG_DIR;
        } else {
            process.env.THEIA_CONFIG_DIR = configDir;
        }
        delete process.env[variable];
    });

    const create = (type: typeof EnvVariablesServerImpl = EnvVariablesServerImpl): EnvVariablesServerImpl => {
        const container = new Container();
        container.bind(ILogger).to(MockLogger);
        container.bind(type).toSelf();
        return container.get(type);
    };

    /** A server that reports an environment of its own, as a subclass might to mask or add variables. */
    class MaskedEnvVariablesServer extends EnvVariablesServerImpl {
        protected override get envs(): { [key: string]: EnvVariable } {
            return { [name]: { name, value: 'masked' } };
        }
    }

    it('reports the environment as it is at the time of the request', async () => {
        const server = create();
        expect(await server.getValue(variable)).to.be.undefined;
        expect((await server.getVariables()).map(env => env.name)).not.to.include(name);

        process.env[variable] = 'set after the server was created';
        expect(await server.getValue(variable)).to.deep.equal({ name, value: 'set after the server was created' });
        expect(await server.getVariables()).to.deep.include({ name, value: 'set after the server was created' });

        process.env[variable] = 'changed';
        expect(await server.getValue(variable)).to.deep.equal({ name, value: 'changed' });
    });

    it('answers a single variable from the environment that it reports as a whole', async () => {
        const server = create(MaskedEnvVariablesServer);
        process.env[variable] = 'in the process';
        expect(await server.getVariables()).to.deep.equal([{ name, value: 'masked' }]);
        expect(await server.getValue(variable)).to.deep.equal({ name, value: 'masked' });
        expect(await server.getValue('PATH')).to.be.undefined;
    });

    it('looks a variable up regardless of case on Windows only', async () => {
        const server = create();
        process.env[variable] = 'value';
        const found = await server.getValue(variable.toLowerCase());
        if (isWindows) {
            expect(found).to.deep.equal({ name, value: 'value' });
        } else {
            expect(found).to.be.undefined;
        }
    });
});
