/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from 'inversify';
import { EnvVariable, EnvVariablesServer } from '../../common/env-variables';

interface ProcessEnv {
    [key: string]: string | undefined;
}

@injectable()
export class EnvVariablesServerImpl implements EnvVariablesServer {

    protected readonly envs: { [key: string]: EnvVariable } = {};

    constructor() {
        const prEnv: ProcessEnv = process.env;
        Object.keys(prEnv).forEach((key: string) => {
            this.envs[key] = {"name" : key, "value" : prEnv[key]};
        });
    }

    async getVariables(): Promise<EnvVariable[]> {
        return Object.keys(this.envs).map(key => this.envs[key]);
    }

    async getValue(key: string): Promise<EnvVariable | undefined> {
        return this.envs[key];
    }
}
