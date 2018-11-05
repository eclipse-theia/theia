/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { inject, injectable, named } from 'inversify';
import * as fileIcons from 'file-icons-js';
import URI from '../common/uri';
import { ContributionProvider } from '../common/contribution-provider';
import { Prioritizeable, MaybePromise } from '../common/types';

export const FOLDER_ICON = 'fa fa-folder';
export const FILE_ICON = 'fa fa-file';

export const LabelProviderContribution = Symbol('LabelProviderContribution');
export interface LabelProviderContribution {

    /**
     * whether this contribution can handle the given element and with what priority.
     * All contributions are ordered by the returned number if greater than zero. The highest number wins.
     * If two or more contributions return the same positive number one of those will be used. It is undefined which one.
     */
    canHandle(element: object): number;

    /**
     * returns an icon class for the given element.
     */
    getIcon?(element: object): MaybePromise<string>;

    /**
     * returns a short name for the given element.
     */
    getName?(element: object): string;

    /**
     * returns a long name for the given element.
     */
    getLongName?(element: object): string;

}

@injectable()
export class DefaultUriLabelProviderContribution implements LabelProviderContribution {

    canHandle(uri: object): number {
        if (uri instanceof URI) {
            return 1;
        }
        return 0;
    }

    getIcon(uri: URI): MaybePromise<string> {
        const iconClass = this.getFileIcon(uri);
        if (!iconClass) {
            if (uri.displayName.indexOf('.') === -1) {
                return FOLDER_ICON;
            } else {
                return FILE_ICON;
            }
        }
        return iconClass;
    }

    protected getFileIcon(uri: URI): string | undefined {
        return fileIcons.getClassWithColor(uri.displayName);
    }

    getName(uri: URI): string {
        return uri.displayName;
    }

    getLongName(uri: URI): string {
        return uri.path.toString();
    }
}

@injectable()
export class LabelProvider {

    constructor(
        @inject(ContributionProvider) @named(LabelProviderContribution)
        protected readonly contributionProvider: ContributionProvider<LabelProviderContribution>
    ) { }

    async getIcon(element: object): Promise<string> {
        const contribs = this.findContribution(element);
        const contrib = contribs.find(c => c.getIcon !== undefined);
        if (!contrib) {
            return '';
        }
        return contrib.getIcon!(element);
    }

    getName(element: object): string {
        const contribs = this.findContribution(element);
        const contrib = contribs.find(c => c.getName !== undefined);
        if (!contrib) {
            return '<unknown>';
        }
        return contrib.getName!(element);
    }

    getLongName(element: object): string {
        const contribs = this.findContribution(element);
        const contrib = contribs.find(c => c.getLongName !== undefined);
        if (!contrib) {
            return '';
        }
        return contrib!.getLongName!(element);
    }

    protected findContribution(element: object): LabelProviderContribution[] {
        const prioritized = Prioritizeable.prioritizeAllSync(this.contributionProvider.getContributions(), contrib =>
            contrib.canHandle(element)
        );
        return prioritized.map(c => c.value);
    }

}
