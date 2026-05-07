// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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
import { injectable } from '@theia/core/shared/inversify';
import { AIConfigurationBaseWidget } from './ai-configuration-base-widget';

/**
 * Base class for AI configuration widgets that display hierarchical or expandable content.
 * This pattern is used by the prompt fragments and tools configuration widgets.
 *
 * This base class provides minimal structure - subclasses implement their own
 * hierarchical rendering logic using the shared ExpandableSection component.
 */
@injectable()
export abstract class AIHierarchicalConfigurationWidget extends AIConfigurationBaseWidget {
    /**
     * Track expansion state for sections.
     */
    protected expandedSections: Set<string> = new Set();

    /**
     * Toggle expansion state for a section.
     */
    protected toggleSection = (sectionId: string): void => {
        if (this.expandedSections.has(sectionId)) {
            this.expandedSections.delete(sectionId);
        } else {
            this.expandedSections.add(sectionId);
        }
        this.update();
    };

    /**
     * Check if a section is expanded.
     */
    protected isSectionExpanded(sectionId: string): boolean {
        return this.expandedSections.has(sectionId);
    }
}
