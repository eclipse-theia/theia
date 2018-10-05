/********************************************************************************
 * Copyright (C) 2018 TypeFox, Inc. and others.
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

import * as fs from 'fs';
import { IJSONSchema } from '@theia/core/lib/common/json-schema';

export async function getSchemaAttributes(pathToVsCodeExtension: string, debugType: string) {
    const taskSchema = {}; // TODO
    const packageJsonPath = `${pathToVsCodeExtension}/package.json`;
    const packageNlsJsonPath = `${pathToVsCodeExtension}/package.nls.json`;
    const nlsMap: any = await new Promise((resolve, reject) => fs.readFile(packageNlsJsonPath, (err, data) => {
        if (err) {
            console.error(err);
            reject(err);
        } else {
            resolve(JSON.parse(data.toString()));
        }
    }));
    const fullPackageJson: any = await new Promise((resolve, reject) => fs.readFile(packageJsonPath, (err, data) => {
        if (err) {
            console.error(err);
            reject(err);
        }
        let text = data.toString();
        for (const key of Object.keys(nlsMap)) {
            const value = nlsMap[key];
            text = text.split('%' + key + '%').join(value);
        }
        resolve(JSON.parse(text));
    }));
    const configurationAttributes = fullPackageJson.contributes.debuggers[1].configurationAttributes;
    return Object.keys(configurationAttributes).map(request => {
        const attributes: IJSONSchema = configurationAttributes[request];
        const defaultRequired = ['name', 'type', 'request'];
        attributes.required = attributes.required && attributes.required.length ? defaultRequired.concat(attributes.required) : defaultRequired;
        attributes.additionalProperties = false;
        attributes.type = 'object';
        if (!attributes.properties) {
            attributes.properties = {};
        }
        const properties = attributes.properties;
        properties['type'] = {
            enum: [debugType],
            description: nls.localize('debugType', 'Type of configuration.'),
            pattern: '^(?!node2)',
            errorMessage: nls.localize('debugTypeNotRecognised',
                'The debug type is not recognized. Make sure that you have a corresponding debug extension installed and that it is enabled.'),
            patternErrorMessage: nls.localize('node2NotSupported',
                '"node2" is no longer supported, use "node" instead and set the "protocol" attribute to "inspector".')
        };
        properties['name'] = {
            type: 'string',
            description: nls.localize('debugName', 'Name of configuration; appears in the launch configuration drop down menu.'),
            default: 'Launch'
        };
        properties['request'] = {
            enum: [request],
            description: nls.localize('debugRequest', 'Request type of configuration. Can be "launch" or "attach".'),
        };
        properties['debugServer'] = {
            type: 'number',
            description: nls.localize('debugServer',
                'For debug extension development only: if a port is specified VS Code tries to connect to a debug adapter running in server mode'),
            default: 4711
        };
        properties['preLaunchTask'] = {
            anyOf: [taskSchema, {
                type: ['string', 'null'],
            }],
            default: '',
            description: nls.localize('debugPrelaunchTask', 'Task to run before debug session starts.')
        };
        properties['postDebugTask'] = {
            anyOf: [taskSchema, {
                type: ['string', 'null'],
            }],
            default: '',
            description: nls.localize('debugPostDebugTask', 'Task to run after debug session ends.')
        };
        properties['internalConsoleOptions'] = INTERNAL_CONSOLE_OPTIONS_SCHEMA;

        const osProperties = Object.assign({}, properties);
        properties['windows'] = {
            type: 'object',
            description: nls.localize('debugWindowsConfiguration', 'Windows specific launch configuration attributes.'),
            properties: osProperties
        };
        properties['osx'] = {
            type: 'object',
            description: nls.localize('debugOSXConfiguration', 'OS X specific launch configuration attributes.'),
            properties: osProperties
        };
        properties['linux'] = {
            type: 'object',
            description: nls.localize('debugLinuxConfiguration', 'Linux specific launch configuration attributes.'),
            properties: osProperties
        };
        Object.keys(attributes.properties).forEach(name => {
            // Use schema allOf property to get independent error reporting #21113
            attributes!.properties![name].pattern = attributes!.properties![name].pattern || '^(?!.*\\$\\{(env|config|command)\\.)';
            attributes!.properties![name].patternErrorMessage = attributes!.properties![name].patternErrorMessage ||
                nls.localize('deprecatedVariables', "'env.', 'config.' and 'command.' are deprecated, use 'env:', 'config:' and 'command:' instead.");
        });

        return attributes;
    });
}

namespace nls {
    export function localize(key: string, _default: string) {
        return _default;
    }
}

const INTERNAL_CONSOLE_OPTIONS_SCHEMA = {
    enum: ['neverOpen', 'openOnSessionStart', 'openOnFirstSessionStart'],
    default: 'openOnFirstSessionStart',
    description: nls.localize('internalConsoleOptions', 'Controls when the internal debug console should open.')
};
