// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { WidgetOpenerOptions } from '@theia/core/lib/browser/widget-open-handler';
import { MiniBrowserProps } from './mini-browser-content';

/**
 * Further options for opening a new `Mini Browser` widget.
 */
export interface MiniBrowserOpenerOptions extends WidgetOpenerOptions, MiniBrowserProps {
    /**
     * Controls how the mini-browser widget should be opened.
     * - `source`: editable source.
     * - `preview`: rendered content of the source.
     */
    openFor?: 'source' | 'preview';
}
