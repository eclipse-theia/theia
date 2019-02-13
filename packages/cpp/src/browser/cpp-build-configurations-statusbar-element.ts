/********************************************************************************
 * Copyright (C) 2018 Ericsson
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

@injectable()
export class CppBuildConfigurationsStatusBarElement {

    @inject(CppBuildConfigurationManager)
    protected readonly cppManager: CppBuildConfigurationManager;

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    protected readonly cppIdentifier = 'cpp-configurator';

    /**
     * Display the cpp build configurations status bar element,
     * and listen to any changes in the active build configuration
     */
    show(): void {
        this.setCppBuildConfigElement(this.cppManager.getActiveConfig());
        this.cppManager.onActiveConfigChange(config => this.setCppBuildConfigElement(config));
    }

    /**
     * Set the cpp build configurations status bar element
     * used to set the workspace's active build configuration
     */
    protected setCppBuildConfigElement(config: CppBuildConfiguration | undefined): void {
        this.statusBar.setElement(this.cppIdentifier, {
            text: `$(wrench) C/C++ Build Config ${(config) ? config.name : ''}`,
            alignment: StatusBarAlignment.RIGHT,
            command: CPP_CHANGE_BUILD_CONFIGURATION.id,
            priority: 0.5,
        });
    }

}
