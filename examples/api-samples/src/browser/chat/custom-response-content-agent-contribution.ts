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

import {
    AbstractStreamParsingChatAgent,
    ChatAgent,
    ChatResponseContent,
    MutableChatRequestModel,
    SerializableChatResponseContentData,
} from '@theia/ai-chat';
import {
    ChatContentDeserializerContribution,
    ChatContentDeserializerRegistry
} from '@theia/ai-chat/lib/common/chat-content-deserializer';
import { ChatResponsePartRenderer } from '@theia/ai-chat-ui/lib/browser/chat-response-part-renderer';
import { ResponseNode } from '@theia/ai-chat-ui/lib/browser/chat-tree-view';
import { Agent } from '@theia/ai-core';
import { injectable, interfaces } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { ReactNode } from '@theia/core/shared/react';

export function bindCustomResponseContentRendererContribution(bind: interfaces.Bind): void {
    bind(CustomResponseContentRendererAgent).toSelf().inSingletonScope();
    bind(Agent).toService(CustomResponseContentRendererAgent);
    bind(ChatAgent).toService(CustomResponseContentRendererAgent);

    bind(ChatContentDeserializerContribution).to(CustomContentDeserializerContribution).inSingletonScope();

    bind(ChatResponsePartRenderer).to(CustomSerializableContentRenderer).inSingletonScope();
    bind(ChatResponsePartRenderer).to(CustomNonSerializableContentRenderer).inSingletonScope();
}

// =============================================================================
// SERIALIZABLE CUSTOM CONTENT
// =============================================================================

/**
 * Data interface for serializable custom content.
 * This is shared between the implementation and the deserializer.
 */
export interface CustomSerializableContentData {
    title: string;
    items: string[];
    timestamp: number;
}

/**
 * Serializable custom content type.
 * This can be persisted and restored from storage.
 */
export interface CustomSerializableContent extends ChatResponseContent {
    kind: 'customSerializable';
    title: string;
    items: string[];
    timestamp: number;
}

export class CustomSerializableContentImpl implements CustomSerializableContent {
    readonly kind = 'customSerializable';

    constructor(
        public title: string,
        public items: string[],
        public timestamp: number
    ) { }

    asString(): string {
        return `${this.title}: ${this.items.join(', ')}`;
    }

    toSerializable(): SerializableChatResponseContentData<CustomSerializableContentData> {
        return {
            kind: 'customSerializable',
            fallbackMessage: `Custom content: ${this.title} (${this.items.length} items)`,
            data: {
                title: this.title,
                items: this.items,
                timestamp: this.timestamp
            }
        };
    }
}

/**
 * Deserializer for custom serializable content.
 */
@injectable()
export class CustomContentDeserializerContribution implements ChatContentDeserializerContribution {
    registerDeserializers(registry: ChatContentDeserializerRegistry): void {
        registry.register({
            kind: 'customSerializable',
            deserialize: (data: CustomSerializableContentData) =>
                new CustomSerializableContentImpl(
                    data.title,
                    data.items,
                    data.timestamp
                )
        });
    }
}

/**
 * Renderer for custom serializable content.
 */
@injectable()
export class CustomSerializableContentRenderer implements ChatResponsePartRenderer<CustomSerializableContent> {
    canHandle(response: ChatResponseContent): number {
        return response.kind === 'customSerializable' ? 10 : -1;
    }

    render(content: CustomSerializableContent, node: ResponseNode): ReactNode {
        const date = new Date(content.timestamp).toLocaleString();
        return React.createElement('div', {
            className: 'theia-ChatResponseContent',
            style: {
                padding: '10px',
                margin: '5px 0',
                border: '2px solid var(--theia-editorWidget-border)',
                borderRadius: '4px',
                backgroundColor: 'var(--theia-editor-background)'
            }
        },
            React.createElement('div', {
                style: {
                    fontWeight: 'bold',
                    marginBottom: '8px',
                    color: 'var(--theia-descriptionForeground)'
                }
            }, `📦 ${content.title}`),
            React.createElement('ul', {
                style: {
                    margin: '0',
                    paddingLeft: '20px'
                }
            }, ...content.items.map((item, idx) =>
                React.createElement('li', { key: idx }, item)
            )),
            React.createElement('div', {
                style: {
                    marginTop: '8px',
                    fontSize: '0.85em',
                    color: 'var(--theia-descriptionForeground)',
                    fontStyle: 'italic'
                }
            }, `Created: ${date} • ✅ Serializable (will be persisted)`)
        );
    }
}

// =============================================================================
// NON-SERIALIZABLE CUSTOM CONTENT
// =============================================================================

/**
 * Non-serializable custom content type.
 */
export interface CustomNonSerializableContent extends ChatResponseContent {
    kind: 'customNonSerializable';
    message: string;
    onClick: () => void;  // Functions cannot be serialized!
}

export class CustomNonSerializableContentImpl implements CustomNonSerializableContent {
    readonly kind = 'customNonSerializable';

    constructor(
        public message: string,
        public onClick: () => void
    ) { }

    asString(): string {
        return `Interactive: ${this.message}`;
    }
}

/**
 * Renderer for custom non-serializable content.
 * This will only be used for active (non-restored) content.
 */
@injectable()
export class CustomNonSerializableContentRenderer implements ChatResponsePartRenderer<CustomNonSerializableContent> {
    canHandle(response: ChatResponseContent): number {
        return response.kind === 'customNonSerializable' ? 10 : -1;
    }

    render(content: CustomNonSerializableContent, node: ResponseNode): ReactNode {
        return React.createElement('div', {
            className: 'theia-ChatResponseContent',
            style: {
                padding: '10px',
                margin: '5px 0',
                border: '2px solid var(--theia-notificationsWarningIcon-foreground)',
                borderRadius: '4px',
                backgroundColor: 'var(--theia-editor-background)'
            }
        },
            React.createElement('div', {
                style: {
                    fontWeight: 'bold',
                    marginBottom: '8px',
                    color: 'var(--theia-descriptionForeground)'
                }
            }, '⚡ Interactive Content'),
            React.createElement('div', {
                style: { marginBottom: '10px' }
            }, content.message),
            React.createElement('button', {
                className: 'theia-button',
                onClick: content.onClick,
                style: { marginRight: '8px' }
            }, 'Click Me!'),
            React.createElement('div', {
                style: {
                    marginTop: '8px',
                    fontSize: '0.85em',
                    color: 'var(--theia-notificationsWarningIcon-foreground)',
                    fontStyle: 'italic'
                }
            }, '⚠️ No deserializer registered (will use fallback for serialization and deserialization)')
        );
    }
}

// =============================================================================
// DEMO AGENT
// =============================================================================

@injectable()
export class CustomResponseContentRendererAgent extends AbstractStreamParsingChatAgent implements ChatAgent {
    id = 'CustomContentSample';
    name = this.id;
    override description = 'Demonstrates custom serializable and non-serializable chat response content';
    languageModelRequirements = [];
    protected defaultLanguageModelPurpose = 'chat';

    public override async invoke(request: MutableChatRequestModel): Promise<void> {
        const response = request.response.response;

        // Add serializable custom content
        response.addContent(
            new CustomSerializableContentImpl(
                'Serializable Custom Content',
                [
                    'This content has a custom data interface',
                    'It has a deserializer registered',
                    'It will be properly restored when loading a saved session',
                    'The renderer shows this custom UI with all data intact'
                ],
                Date.now()
            )
        );

        // Add interactive button as a demonstration of non-serializable content
        let clickCount = 0;
        response.addContent(
            new CustomNonSerializableContentImpl(
                'This is the LLM message received',
                () => {
                    clickCount++;
                    alert(`Button clicked ${clickCount} time(s)`);
                }
            )
        );

        // Trigger completion immediately - no streaming needed
        request.response.complete();
    }
}
