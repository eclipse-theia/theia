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

import { LabelProviderContribution } from '@theia/core/lib/browser/label-provider';
import URI from '@theia/core/lib/common/uri';
import { JAVA_SCHEME } from '../common/index';
import { MaybePromise } from '@theia/core/lib/common';
import { injectable } from 'inversify';

@injectable()
export class JavaLabelProviderContribution implements LabelProviderContribution {

    canHandle(element: object): number {
        if (element instanceof URI && element.scheme === JAVA_SCHEME) {
            return 30;
        } else {
            return -1;
        }
    }

    /**
     * returns an icon class for the given element.
     */
    getIcon(element: URI): MaybePromise<string> {
        return 'java-icon';
    }

    /**
     * returns a short name for the given element.
     */
    getName(element: URI): string {
        return element.displayName;
    }

    /**
     * returns a long name for the given element.
     */
    getLongName(element: URI): string {
        return element.path.toString();
    }
}
