// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { nls } from '@theia/core/lib/common/nls';
import { MessageService } from '@theia/core/lib/common/message-service';
import { QaapElementPickerService } from './qaap-element-picker-service';
import { QAAP_PICK_ELEMENT_COMMAND_ID } from './qaap-element-picker-tools-common';

export namespace QaapPickElementCommands {
    export const PICK: Command = {
        id: QAAP_PICK_ELEMENT_COMMAND_ID,
        category: nls.localize('theia/mini-browser/category', 'Mini Browser'),
        label: nls.localize('theia/mini-browser/pickElement', 'Pick an element to send to chat'),
    };
}

@injectable()
export class QaapElementPickerCommandContribution implements CommandContribution {

    @inject(QaapElementPickerService)
    protected readonly picker: QaapElementPickerService;

    @inject(MessageService)
    protected readonly messages: MessageService;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(QaapPickElementCommands.PICK, {
            execute: () => this.executePick(),
            isEnabled: () => this.picker.hasPreviewTab(),
        });
    }

    protected async executePick(): Promise<void> {
        const activation = this.picker.activatePicker();
        if (activation.started) {
            this.messages.info(activation.message);
        } else {
            this.messages.warn(activation.message);
        }
    }
}
