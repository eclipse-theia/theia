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
import {
    TaskDefinition, TaskConfiguration, TaskDefinitionRegistry, TaskDefinitionContribution
} from '../common';

@injectable()
export class TaskDefinitionRegistryImpl implements TaskDefinitionRegistry {

    // task type - array of task definitions
    private definitions: Map<string, TaskDefinition[]> = new Map();

    getDefinitions(taskType: string): TaskDefinition[] {
        return this.definitions.get(taskType) || [];
    }

    getDefinition(taskConfiguration: TaskConfiguration): TaskDefinition | undefined {
        const definitions = this.getDefinitions(taskConfiguration.taskType || taskConfiguration.type);
        let matchedDefinition: TaskDefinition | undefined;
        let highest = -1;
        for (const def of definitions) {
            let score = 0;
            if (!def.properties.required.every(requiredProp => taskConfiguration[requiredProp] !== undefined)) {
                continue;
            }
            score += def.properties.required.length; // number of required properties
            const requiredProps = new Set(def.properties.required);
            // number of optional properties
            score += def.properties.all.filter(p => !requiredProps.has(p) && taskConfiguration[p] !== undefined).length;
            if (score > highest) {
                highest = score;
                matchedDefinition = def;
            }
        }
        return matchedDefinition;
    }

    async register(definitionContribution: TaskDefinitionContribution, pluginId: string): Promise<void> {
        const definition = {
            id: pluginId,
            taskType: definitionContribution.type,
            properties: {
                required: definitionContribution.required,
                all: Object.keys(definitionContribution.properties)
            }
        };
        const taskType = definition.taskType;
        this.definitions.set(taskType, [...this.getDefinitions(taskType), definition]);
    }
}
