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

import { inject, injectable } from '@theia/core/shared/inversify';
import { URI } from '@theia/core';
import { ChangeSetElement } from '../common/change-set';
import { ChangeSetElementDeserializerContribution, ChangeSetElementDeserializerRegistry, ChangeSetDeserializationContext } from '../common/change-set-element-deserializer';
import { SerializableChangeSetElement, SerializableChangeSetFileElementData } from '../common/chat-model-serialization';
import { ChangeSetElementArgs, ChangeSetFileElementFactory } from './change-set-file-element';

@injectable()
export class ChangeSetFileElementDeserializerContribution implements ChangeSetElementDeserializerContribution {

    @inject(ChangeSetFileElementFactory)
    protected readonly fileElementFactory: ChangeSetFileElementFactory;

    registerDeserializers(registry: ChangeSetElementDeserializerRegistry): void {
        registry.register({
            kind: 'file',
            deserialize: async (serialized: SerializableChangeSetElement, context: ChangeSetDeserializationContext): Promise<ChangeSetElement> => {
                const fileData = serialized.data as SerializableChangeSetFileElementData | undefined;

                // Create ChangeSetElementArgs with all the necessary data
                const args: ChangeSetElementArgs = {
                    uri: new URI(serialized.uri),
                    chatSessionId: context.chatSessionId,
                    requestId: context.requestId,
                    name: serialized.name,
                    icon: serialized.icon,
                    additionalInfo: serialized.additionalInfo,
                    state: serialized.state,
                    type: serialized.type,
                    data: serialized.data,
                    targetState: fileData?.targetState,
                    originalState: fileData?.originalState,
                    replacements: fileData?.replacements
                };

                // Create the element using the factory
                const element = this.fileElementFactory(args);

                // Ensure it's initialized before returning
                await element.ensureInitialized();

                return element;
            }
        });
    }
}
