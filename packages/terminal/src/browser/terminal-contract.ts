// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses as the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { TerminalWidget, TerminalWidgetOptions } from './base/terminal-widget';
import { nls } from '@theia/core/lib/common/nls';

/**
 * Lightweight contract for the terminal widget: identifiers, types and
 * helpers. Kept separate from `terminal-widget-impl` so that eagerly loaded
 * modules (contributions, module factories, consumers matching widgets) do
 * not pull in the xterm stack; the widget implementation is loaded lazily by
 * the widget factory.
 */

export const TERMINAL_WIDGET_FACTORY_ID = 'terminal';

export const TERMINAL_WIDGET_LABEL = nls.localizeByDefault('Terminal');

export interface TerminalWidgetFactoryOptions extends Partial<TerminalWidgetOptions> {
    /**
     * An opaque, unique string per terminal. Historically a date string, but
     * it should not be interpreted as a date. Callers should use
     * {@link nextTerminalCreationToken} to obtain a value that is guaranteed
     * unique within the current process.
     */
    created: string
}

let terminalCreationCounter = 0;
/**
 * Produce a token suitable for {@link TerminalWidgetFactoryOptions.created}
 * that is guaranteed unique within the current process. Combines the current
 * wall-clock time with a monotonically increasing counter so callers cannot
 * accidentally collide even when constructing terminals within the same
 * millisecond.
 */
export function nextTerminalCreationToken(): string {
    return `${Date.now()}-${terminalCreationCounter++}`;
}

/**
 * Marker for terminal widget instances. `instanceof TerminalWidgetImpl`
 * requires a static import of the heavy implementation class and is therefore
 * incompatible with lazy loading; the marker is assigned by the
 * `TerminalWidgetImpl` constructor.
 */
export const TERMINAL_WIDGET_MARKER = Symbol.for('theiaTerminalWidget');

export function isTerminalWidget(widget: unknown): widget is TerminalWidget {
    return typeof widget === 'object' && widget !== null
        && (widget as { [TERMINAL_WIDGET_MARKER]?: unknown })[TERMINAL_WIDGET_MARKER] === true;
}

/**
 * Moved from `terminal-widget-impl` (which re-exports it for compatibility)
 * so that contributions can be matched without importing the xterm stack.
 */
export const TerminalContribution = Symbol('TerminalContribution');
export interface TerminalContribution {
    onCreate(term: import('./terminal-widget-impl').TerminalWidgetImpl): void;
}

/**
 * Declared here and re-exported by `terminal-link-provider` so that eagerly
 * loaded consumers can reference the symbols without importing the link
 * machinery.
 */
export const TerminalLinkProvider = Symbol('TerminalLinkProvider');
export interface TerminalLinkProvider {
    provideLinks(line: string, terminal: TerminalWidget, cancellationToken?: import('@theia/core/lib/common/cancellation').CancellationToken): Promise<TerminalLink[]>;
}

export const TerminalLink = Symbol('TerminalLink');
export interface TerminalLink {
    startIndex: number;
    length: number;
    tooltip?: string;
    handle(): Promise<void>;
}

/**
 * Extension point for overriding the terminal widget class. The lazy widget
 * factory owns the only `TerminalWidget` binding (in a child container), so
 * the previous root-level `rebind(TerminalWidget).to(X)` pattern no longer
 * works. Bind this symbol to a promise of a `TerminalWidgetImpl` subclass,
 * e.g. `bind(TERMINAL_WIDGET_OVERRIDE).toDynamicValue(() =>
 * import('./X').then(m => m.X))`, to keep the class and its xterm stack out
 * of the eager graph.
 */
export const TERMINAL_WIDGET_OVERRIDE = Symbol('TerminalWidgetOverride');
