/********************************************************************************
 * Copyright (C) 2022 Arm and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { WorkspaceFrontendContribution } from './workspace-frontend-contribution';
import { Saveable, SaveOptions, Widget } from '@theia/core/lib/browser';
import { SaveResourceService } from '@theia/core/lib/browser/save-resource-service';
import { MessageService } from '@theia/core/lib/common';

@injectable()
export class WorkspaceSaveResourceService extends SaveResourceService {

    @inject(WorkspaceFrontendContribution) protected readonly workspaceFrontendContribution: WorkspaceFrontendContribution;

    @inject(MessageService) protected readonly messageService: MessageService;

    override canSave(saveable: Saveable): boolean {
        // In addition to dirty documents, untitled documents can be saved because for these we treat 'Save' as 'Save As'.
        return Saveable.isDirty(saveable) || Saveable.isUntitled(saveable);
    }

    override async save(widget: Widget | undefined, options?: SaveOptions): Promise<void> {
        const saveable = Saveable.get(widget);
        if (widget instanceof Widget && this.workspaceFrontendContribution.canBeSavedAs(widget) && saveable) {
            if (Saveable.isUntitled(saveable)) {
                this.workspaceFrontendContribution.saveAs(widget);
            } else {
                await saveable.save(options);
            }
        } else {
            // This should not happen because the caller should check this.
            this.messageService.error(`Cannot save the current widget "${widget?.title}" .`);
        }

    }

}
