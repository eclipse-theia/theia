// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { isCancelled } from '@theia/core';
import {
    VariableResolverService,
    VariableResolveOptions,
} from '@theia/variable-resolver/lib/browser/variable-resolver-service';

@injectable()
export class QaapVariableResolverService extends VariableResolverService {

    override async resolve<T>(value: T, options: VariableResolveOptions = {}): Promise<T | undefined> {
        const context = new QaapVariableResolverContext(this.variableRegistry, options);
        try {
            return await this.doResolve(value, context);
        } catch (error) {
            if (isCancelled(error)) {
                return undefined;
            }
            throw error;
        }
    }
}

class QaapVariableResolverContext extends VariableResolverService.Context {

    override async resolve(name: string): Promise<void> {
        if (this.resolved.has(name)) {
            return;
        }
        try {
            let variableName = name;
            let argument: string | undefined;
            const parts = name.split(':', 2);
            if (parts.length > 1) {
                variableName = parts[0];
                argument = parts[1];
            }
            const variable = this.variableRegistry.getVariable(variableName);
            const resolved = await variable?.resolve(
                this.options.context,
                argument,
                this.options.configurationSection,
                this.options.commandIdVariables,
                this.options.configuration
            );
            if (
                typeof resolved === 'bigint' ||
                typeof resolved === 'boolean' ||
                typeof resolved === 'number' ||
                typeof resolved === 'string'
            ) {
                this.resolved.set(name, `${resolved}`);
            } else {
                this.resolved.set(name, undefined);
            }
        } catch (e) {
            if (isCancelled(e)) {
                throw e;
            }
            if (e instanceof Error && (e.name === 'Canceled' || e.message === 'Canceled')) {
                this.resolved.set(name, undefined);
                return;
            }
            this.resolved.set(name, undefined);
            console.error(`Failed to resolve '${name}' variable:`, e);
        }
    }
}
