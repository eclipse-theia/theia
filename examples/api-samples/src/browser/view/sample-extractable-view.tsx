// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { ApplicationShell, codicon, ReactWidget } from '@theia/core/lib/browser';
import { ExtractableWidget } from '@theia/core/lib/browser/widgets/extractable-widget';
import { injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';

import '../../../src/browser/view/sample-extractable-view.css';

const CUSTOM_THEME_STYLE_ID = 'sample-extractable-custom-theme';

/**
 * A sample extractable widget that demonstrates dynamic CSS injection
 * and style propagation to secondary windows via SecondaryWindowStyleMirror.
 */
@injectable()
export class SampleExtractableView extends ReactWidget implements ExtractableWidget {
    static readonly ID = 'sampleExtractableView';

    isExtractable = true;
    secondaryWindow: Window | undefined;
    previousArea?: ApplicationShell.Area;

    private colorsToggled = false;

    @postConstruct()
    init(): void {
        this.id = SampleExtractableView.ID;
        this.title.label = 'Sample Extractable View';
        this.title.caption = 'Sample Extractable View';
        this.title.iconClass = codicon('symbol-color');
        this.title.closable = true;
        this.addClass('sample-extractable-view');
        this.update();
    }

    toggleColors(): void {
        this.colorsToggled = !this.colorsToggled;
        const existing = document.getElementById(CUSTOM_THEME_STYLE_ID);
        if (this.colorsToggled) {
            if (!existing) {
                const style = document.createElement('style');
                style.id = CUSTOM_THEME_STYLE_ID;
                style.textContent = `
                    .sample-extractable-view {
                        background-color: #1a3a2a !important;
                        color: #a8e6cf !important;
                    }
                    .sample-extractable-view button {
                        background-color: #6b4c9a !important;
                        color: #f0e6ff !important;
                        border-color: #7d5fb2 !important;
                    }
                    .sample-extractable-view button:hover {
                        background-color: #7d5fb2 !important;
                    }
                    .sample-extractable-view .status {
                        background-color: #2a1a3a !important;
                        border-color: #6b4c9a !important;
                        color: #a8e6cf !important;
                    }
                `;
                document.head.appendChild(style);
            }
        } else {
            if (existing) {
                existing.remove();
            }
        }
        this.update();
    }

    protected render(): React.ReactNode {
        return (
            <div>
                <h2>Sample Extractable View</h2>
                <p>
                    This widget tests that dynamically injected CSS styles apply consistently
                    in the main window and in secondary (extracted) windows.
                    Use &quot;Move to Secondary Window&quot; from the tab context menu to extract this view,
                    then toggle colours to verify they appear in both windows.
                </p>
                <div className='button-group'>
                    <button onClick={() => this.toggleColors()}>Toggle Colors</button>
                </div>
                <div className='status'>
                    {this.colorsToggled ? 'Custom colours are ON' : 'Custom colours are OFF (default theme)'}
                </div>
            </div>
        );
    }
}
