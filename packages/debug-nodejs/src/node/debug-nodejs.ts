/*
 * Copyright (C) 2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

const path = require('path');
const packageJson = require('../../package.json');
const debugAdapterDir = packageJson['debugAdapter']['dir'];

import { injectable } from "inversify";
import { DebugConfiguration } from "@theia/debug/lib/common/debug-common";
import { DebugAdapterContribution, DebugAdapterExecutable } from "@theia/debug/lib/node/debug-model";

@injectable()
export class NodeJsDebugAdapterContribution implements DebugAdapterContribution {
    readonly debugType = "node";

    provideDebugConfigurations = [{
        "type": this.debugType,
        "request": "attach",
        "name": "Attach by PID",
        "processId": ""
    }];

    resolveDebugConfiguration(config: DebugConfiguration): DebugConfiguration {
        if (!config.request) {
            throw new Error("Debug request type isn't provided.");
        }

        switch (config.request) {
            case "attach": this.validateAttachConfig(config);
        }

        return config;
    }

    provideDebugAdapterExecutable(config: DebugConfiguration): DebugAdapterExecutable {
        const program = path.join(__dirname, `../../${debugAdapterDir}/out/src/nodeDebug.js`);
        return {
            program,
            runtime: "node"
        };
    }

    private validateAttachConfig(config: DebugConfiguration) {
        if (!config.processId) {
            throw new Error("PID isn't provided.");
        }
    }
}
