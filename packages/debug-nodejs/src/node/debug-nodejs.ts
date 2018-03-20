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

import { injectable } from "inversify";
import {
    DebugConfiguration,
    DebugAdapterExecutable,
    DebugAdapterContribution
} from "@theia/debug/lib/common/debug-model";

@injectable()
export class NodeJsDebugAdapterContribution implements DebugAdapterContribution {
    readonly debugType = "Node Js";

    provideDebugConfigurations(): DebugConfiguration[] {
        return [{ name: "", type: "" }];
    }

    resolveDebugConfiguration(config: DebugConfiguration): DebugConfiguration | undefined {
        return config;
    }

    provideDebugAdapterExecutable(config: DebugConfiguration): DebugAdapterExecutable | undefined {
        return { command: "", args: [] };
    }
}
