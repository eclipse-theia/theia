// *****************************************************************************
// Copyright (C) 2025 Typefox and others.
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

import { inject, injectable, interfaces, LazyServiceIdentifier } from '@theia/core/shared/inversify';
import { DockerContainerService } from '../docker-container-service';

export const VariableResolverContribution = Symbol('VariableResolverContribution');
export interface VariableResolverContribution {
    canResolve(variable: string): boolean;
    resolve(variable: string): string;
}

export function registerVariableResolverContributions(bind: interfaces.Bind): void {
    bind(VariableResolverContribution).to(LocalEnvVariableResolver).inSingletonScope();
    bind(VariableResolverContribution).to(ContainerIdResolver).inSingletonScope();
}

@injectable()
export class LocalEnvVariableResolver implements VariableResolverContribution {
    canResolve(type: string): boolean {
        console.log(`Resolving localEnv variable: ${type}`);
        return type === 'localEnv';
    }

    resolve(variable: string): string {
        return process.env[variable] || '';
    }
}

@injectable()
export class ContainerIdResolver implements VariableResolverContribution {
    @inject(new LazyServiceIdentifier(() => DockerContainerService))
        protected readonly dockerContainerService: DockerContainerService;

    canResolve(type: string): boolean {
        return type === 'devcontainerId' && !!this.dockerContainerService.container;
    }
    resolve(variable: string): string {
        return this.dockerContainerService.container?.id || variable;
    }
}
