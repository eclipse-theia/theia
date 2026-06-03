// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { TerminalThemeService } from '@theia/terminal/lib/browser/terminal-theme-service';
import { ITheme } from 'xterm';

/**
 * Resolves xterm colors from computed `--theia-*` CSS variables so integrated
 * terminals pick up Qaap token overrides (and theme changes) instead of staying
 * on the raw VS Code theme JSON hex baked into xterm's inline viewport styles.
 */
@injectable()
export class QaapTerminalThemeService extends TerminalThemeService {

    override get theme(): ITheme {
        const base = super.theme;
        return {
            ...base,
            background: this.readThemeCssColor('--theia-terminal-background') ?? base.background,
            foreground: this.readThemeCssColor('--theia-terminal-foreground') ?? base.foreground,
            cursor: this.readThemeCssColor('--theia-terminalCursor-foreground') ?? base.cursor,
            cursorAccent: this.readThemeCssColor('--theia-terminalCursor-background') ?? base.cursorAccent,
            selectionBackground: this.readThemeCssColor('--theia-terminal-selectionBackground') ?? base.selectionBackground,
            selectionInactiveBackground:
                this.readThemeCssColor('--theia-terminal-inactiveSelectionBackground') ?? base.selectionInactiveBackground,
            selectionForeground: this.readThemeCssColor('--theia-terminal-selectionForeground') ?? base.selectionForeground,
        };
    }

    protected readThemeCssColor(variableName: string): string | undefined {
        if (typeof document === 'undefined') {
            return undefined;
        }
        const value = getComputedStyle(document.body).getPropertyValue(variableName).trim();
        return value || undefined;
    }
}
