/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
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

import { injectable } from 'inversify';

export const cppBuildConfigurationServerPath = '/services/cppbuildconfigurationserver';

/**
 * Representation of a cpp build configuration.
 */
export interface CppBuildConfiguration {

    /**
     * The human-readable build configuration name.
     */
    name: string;

    /**
     * The base directory of the build configuration.
     */
    directory: string;

    /**
     * The list of commands for the build configuration.
     */
    commands?: {
        'build'?: string
    };
}

export const CppBuildConfigurationServer = Symbol('CppBuildConfigurationServer');
/**
 * A `CppBuildConfigurationServer` is meant to do heavy disk operations on the
 * project's filesystem, such as merging multiple compilation databases together.
 */
export interface CppBuildConfigurationServer {

    /**
     * Compilation databases get fairly big fairly quickly, so we want to
     * offload this to the backend server somehow. Could be optimized by using
     * sub-processing or anything else that would avoid stalling the application.
     *
     * @param params.configurations The list of configs to merge together.
     */
    getMergedCompilationDatabase(params: { directories: string[] }): Promise<string>;

}

@injectable()
export class MockCppBuildConfigurationServer implements CppBuildConfigurationServer {
    constructor() { }
    dispose() { }
    getMergedCompilationDatabase(params: { directories: string[] }): Promise<string> {
        return Promise.resolve('');
    }
}
