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
import { injectable } from '@theia/core/shared/inversify';
import { MenuPath } from '@theia/core/lib/common';
import { MonacoContextMenuService } from '@theia/monaco/lib/browser/monaco-context-menu';

export namespace OutputContextMenu {
    export const MENU_PATH: MenuPath = ['output_context_menu'];
    export const TEXT_EDIT_GROUP = [...MENU_PATH, '0_text_edit_group'];
    export const COMMAND_GROUP = [...MENU_PATH, '1_command_group'];
    export const WIDGET_GROUP = [...MENU_PATH, '2_widget_group'];
}

@injectable()
export class OutputContextMenuService extends MonacoContextMenuService {

    protected menuPath(): MenuPath {
        return OutputContextMenu.MENU_PATH;
    }

}
