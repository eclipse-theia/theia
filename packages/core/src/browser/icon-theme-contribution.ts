/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { injectable, inject, named } from 'inversify';
import { FrontendApplicationContribution } from './frontend-application';
import { ContributionProvider } from '../common/contribution-provider';
import { IconThemeService, IconTheme } from './icon-theme-service';
import { MaybePromise } from '../common/types';
import { Disposable } from '../common/disposable';

export const IconThemeContribution = Symbol('IconThemeContribution');
export interface IconThemeContribution {
    registerIconThemes(iconThemes: IconThemeService): MaybePromise<void>;
}

@injectable()
export class IconThemeApplicationContribution implements FrontendApplicationContribution {

    @inject(IconThemeService)
    protected readonly iconThemes: IconThemeService;

    @inject(ContributionProvider) @named(IconThemeContribution)
    protected readonly iconThemeContributions: ContributionProvider<IconThemeContribution>;

    async onStart(): Promise<void> {
        for (const contribution of this.iconThemeContributions.getContributions()) {
            await contribution.registerIconThemes(this.iconThemes);
        }
    }

}

@injectable()
export class DefaultFileIconThemeContribution implements IconTheme, IconThemeContribution {

    readonly id = 'theia-file-icons';
    readonly label = 'File Icons (Theia)';
    readonly hasFileIcons = true;
    readonly hasFolderIcons = true;

    registerIconThemes(iconThemes: IconThemeService): MaybePromise<void> {
        iconThemes.register(this);
    }

    /* rely on behaviour before for backward-compatibility */
    activate(): Disposable {
        return Disposable.NULL;
    }

}
