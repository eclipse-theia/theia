/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
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

import { injectable, interfaces, postConstruct, inject } from '@theia/core/shared/inversify';
import { SourceTreeWidget } from '@theia/core/lib/browser/source-tree';
import { VSXExtensionsSource, VSXExtensionsSourceOptions } from './vsx-extensions-source';

@injectable()
export class VSXExtensionsWidgetOptions extends VSXExtensionsSourceOptions {
}

@injectable()
export class VSXExtensionsWidget extends SourceTreeWidget {

    static ID = 'vsx-extensions';
    static INSTALLED_ID = VSXExtensionsWidget.ID + ':' + VSXExtensionsSourceOptions.INSTALLED;
    static SEARCH_RESULT_ID = VSXExtensionsWidget.ID + ':' + VSXExtensionsSourceOptions.SEARCH_RESULT;
    static BUILT_IN_ID = VSXExtensionsWidget.ID + ':' + VSXExtensionsSourceOptions.BUILT_IN;

    static createWidget(parent: interfaces.Container, options: VSXExtensionsWidgetOptions): VSXExtensionsWidget {
        const child = SourceTreeWidget.createContainer(parent, {
            virtualized: false,
            scrollIfActive: true
        });
        child.bind(VSXExtensionsSourceOptions).toConstantValue(options);
        child.bind(VSXExtensionsSource).toSelf();
        child.unbind(SourceTreeWidget);
        child.bind(VSXExtensionsWidgetOptions).toConstantValue(options);
        child.bind(VSXExtensionsWidget).toSelf();
        return child.get(VSXExtensionsWidget);
    }

    @inject(VSXExtensionsWidgetOptions)
    protected readonly options: VSXExtensionsWidgetOptions;

    @inject(VSXExtensionsSource)
    protected readonly extensionsSource: VSXExtensionsSource;

    @postConstruct()
    protected init(): void {
        super.init();
        this.addClass('theia-vsx-extensions');

        this.id = VSXExtensionsWidget.ID + ':' + this.options.id;
        const title = this.computeTitle();
        this.title.label = title;
        this.title.caption = title;

        this.toDispose.push(this.extensionsSource);
        this.source = this.extensionsSource;
    }

    protected computeTitle(): string {
        if (this.id === VSXExtensionsWidget.INSTALLED_ID) {
            return 'Installed';
        }
        if (this.id === VSXExtensionsWidget.BUILT_IN_ID) {
            return 'Built-in';
        }
        return 'Open VSX Registry';
    }

}
