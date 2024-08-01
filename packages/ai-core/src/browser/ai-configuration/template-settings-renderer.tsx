// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
import * as React from '@theia/core/shared/react';
import { PromptCustomizationService } from '../../common/prompt-service';
import { PromptTemplate } from '../../common';

export interface TemplateSettingProps {
    agentId: string;
    template: PromptTemplate;
    promptCustomizationService: PromptCustomizationService;
}

export const TemplateRenderer: React.FC<TemplateSettingProps> = ({ agentId, template, promptCustomizationService }) => {
    const openTemplate = React.useCallback(async () => {
        promptCustomizationService.editTemplate(template.id);
    }, [template, promptCustomizationService]);
    const resetTemplate = React.useCallback(async () => {
        promptCustomizationService.resetTemplate(template.id);
    }, [promptCustomizationService, template]);

    return <>
        {template.id}
        <button className='theia-button main' onClick={openTemplate}>Edit</button>
        <button className='theia-button secondary' onClick={resetTemplate}>Reset</button>
    </>;
};
