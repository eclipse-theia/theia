// *****************************************************************************
// Copyright (C) 2022 Alexander Flammer.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject, named } from 'inversify';
import { ContributionProvider, MaybePromise } from '../../common';
import { FrontendApplication, FrontendApplicationContribution } from '../frontend-application';
import { WatermarkCommandRegistry } from './watermark-command-registry';

export const WatermarkCommandContribution = Symbol('WatermarkCommandContribution');
/**
 * The watermark command contribution should be implemented to register custom watermark commands.
 */
export interface WatermarkCommandContribution {
    /**
     * Register watermark commands.
     */
    registerWatermarkCommands(registry: WatermarkCommandRegistry): void;
}

@injectable()
export class WatermarkCommandApplicationContribution implements FrontendApplicationContribution {

    @inject(ContributionProvider) @named(WatermarkCommandContribution)
    protected readonly watermarkCommandContributions: ContributionProvider<WatermarkCommandContribution>;

    @inject(WatermarkCommandRegistry)
    protected readonly registry: WatermarkCommandRegistry;

    onStart(app: FrontendApplication): MaybePromise<void> {
        for (const contribution of this.watermarkCommandContributions.getContributions()) {
            contribution.registerWatermarkCommands(this.registry);
        }
    }

}
