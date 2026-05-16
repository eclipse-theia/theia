// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { codicon } from '@theia/core/lib/browser';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { injectable } from '@theia/core/shared/inversify';
import { PreviewWidget } from '@theia/preview/lib/browser/preview-widget';
import { PreviewCommands, PreviewContribution } from '@theia/preview/lib/browser/preview-contribution';

@injectable()
export class QaapPreviewContribution extends PreviewContribution {

    override registerCommands(registry: CommandRegistry): void {
        registry.registerCommand({
            ...PreviewCommands.OPEN,
            iconClass: codicon('play')
        }, {
            execute: widget => this.openForEditor(widget),
            isEnabled: widget => this.canHandleEditorUri(widget),
            isVisible: widget => this.canHandleEditorUri(widget)
        });
        registry.registerCommand(PreviewCommands.OPEN_SOURCE, {
            execute: widget => this.openSource(widget),
            isEnabled: widget => widget instanceof PreviewWidget,
            isVisible: widget => widget instanceof PreviewWidget
        });
    }
}
