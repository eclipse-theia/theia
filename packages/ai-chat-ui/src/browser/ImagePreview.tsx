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
import { nls } from '@theia/core';
import * as React from '@theia/core/shared/react';

// Interface for pasted image data
export interface PastedImage {
    id: string;
    data: string;
    name: string;
    type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
}

// Image Preview Component
interface ImagePreviewProps {
    images: PastedImage[];
    onRemove: (id: string) => void;
}
export const ImagePreview: React.FC<ImagePreviewProps> = ({ images, onRemove }) => {
    if (images.length === 0) { return undefined; }

    return (
        <div className='theia-ChatInput-ImagePreview'>
            {images.map(img => (
                <div key={img.id} className='theia-ChatInput-ImagePreview-Item'>
                    <img src={`data:${img.type};base64,${img.data}`} alt={img.name} />
                    <div className='theia-ChatInput-ImagePreview-Actions'>
                        <span
                            className='codicon codicon-close action'
                            title={nls.localizeByDefault('Remove')}
                            onClick={e => {
                                e.stopPropagation();
                                onRemove(img.id);
                            }} />
                    </div>
                </div>
            ))}
        </div>
    );
};
