/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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
import { injectable, inject } from "inversify";
import {
    PreferenceService,
    //  PreferenceSchemaProvider
} from "@theia/core/lib/browser";
// import { ConsolidatedPluginConfigurationProvider } from "../consolidated-plugin-configuration";

@injectable()
export class ConsolidatedConfigurationRegistry {

    constructor(
        @inject(PreferenceService) private prefService: PreferenceService,
        // @inject(PreferenceSchemaProvider) private readonly prefChemaProvider: PreferenceSchemaProvider,
        // @inject(ConsolidatedPluginConfigurationProvider) private readonly pluginConfProvider: ConsolidatedPluginConfigurationProvider
    ) {
        console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
        // todo apply on pref changed handler
        // todo apply handler for add new plugin
        this.prefService.onPreferenceChanged(e => {
            console.log('pref changed!!!');
            // todo get change from event !!!!
        //     this.proxy.$acceptConfigurationChanged(prefService.getPreferences(), e);
        });
    }

    // getValue(section: string) {
    // }

    // private getConsolidatedConfig() {

    // }
}
