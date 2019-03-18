/********************************************************************************
 * Copyright (C) 2018-2019 Ericsson
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

import { injectable, inject } from 'inversify';
import { StatusBar, StatusBarAlignment } from '@theia/core/lib/browser';
import { CppBuildConfigurationManager, CppBuildConfiguration } from './cpp-build-configurations';
import { CPP_CHANGE_BUILD_CONFIGURATION } from './cpp-build-configurations-ui';
import { WorkspaceService } from '@theia/workspace/lib/browser';

@injectable()
export class CppBuildConfigurationsStatusBarElement {

    @inject(CppBuildConfigurationManager)
    protected readonly cppManager: CppBuildConfigurationManager;

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    protected readonly cppIdentifier = 'cpp-configurator';

    /**
     * Display the `CppBuildConfiguration` status bar element,
     * and listen to changes to the active build configuration.
     */
    show(): void {
        this.setCppBuildConfigElement(this.getValidActiveCount());
        this.cppManager.onActiveConfigChange2(configs => this.setCppBuildConfigElement(configs.size));
    }

    /**
     * Set the `CppBuildConfiguration` status bar element
     * used to create a new cpp build configuration and set the active build configuration.
     *
     * @param config the active `CppBuildConfiguration`.
     */
    protected setCppBuildConfigElement(count: number): void {
        this.statusBar.setElement(this.cppIdentifier, {
            text: `$(wrench) C/C++ Build Config (${count} of ${this.workspaceService.tryGetRoots().length})`,
            tooltip: 'C/C++ Build Config',
            alignment: StatusBarAlignment.RIGHT,
            command: CPP_CHANGE_BUILD_CONFIGURATION.id,
            priority: 0.5,
        });
    }

    /**
     * Get the valid active configuration count.
     */
    protected getValidActiveCount(): number {
        let items: (CppBuildConfiguration | undefined)[] = [];
        if (this.cppManager.getAllActiveConfigs) {
            items = [...this.cppManager.getAllActiveConfigs().values()].filter(config => !!config);
        }
        return items.length;
    }

}
