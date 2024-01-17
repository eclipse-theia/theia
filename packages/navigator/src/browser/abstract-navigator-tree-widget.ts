// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { FileNavigatorPreferences } from './navigator-preferences';
import { FileTreeWidget } from '@theia/filesystem/lib/browser';
import { Attributes, HTMLAttributes } from '@theia/core/shared/react';
import { TreeNode } from '@theia/core/lib/browser';

@injectable()
export class AbstractNavigatorTreeWidget extends FileTreeWidget {

    @inject(FileNavigatorPreferences)
    protected readonly navigatorPreferences: FileNavigatorPreferences;

    @postConstruct()
    protected override init(): void {
        super.init();
        this.toDispose.push(
            this.preferenceService.onPreferenceChanged(preference => {
                if (preference.preferenceName === 'explorer.decorations.colors') {
                    this.update();
                }
            })
        );
    }

    protected override decorateCaption(node: TreeNode, attrs: HTMLAttributes<HTMLElement>): Attributes & HTMLAttributes<HTMLElement> {
        const attributes = super.decorateCaption(node, attrs);
        if (this.navigatorPreferences.get('explorer.decorations.colors')) {
            return attributes;
        } else {
            return {
                ...attributes,
                style: {
                    ...attributes.style,
                    color: undefined,
                }
            };
        }
    }
}
