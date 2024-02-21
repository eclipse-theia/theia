// *****************************************************************************
// Copyright (C) 2023 Red Hat, Inc. and others.
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

import { IDataTransferItem, IReadonlyVSDataTransfer } from '@theia/monaco-editor-core/esm/vs/base/common/dataTransfer';
import { DataTransferDTO, DataTransferItemDTO } from '../../../common/plugin-api-rpc-model';
import { URI } from '../../../plugin/types-impl';

export namespace DataTransferItem {
    export async function from(mime: string, item: IDataTransferItem): Promise<DataTransferItemDTO> {
        const stringValue = await item.asString();

        if (mime === 'text/uri-list') {
            return {
                asString: '',
                fileData: undefined,
                uriListData: serializeUriList(stringValue),
            };
        }

        const fileValue = item.asFile();
        return {
            asString: stringValue,
            fileData: fileValue ? { id: fileValue.id, name: fileValue.name, uri: fileValue.uri } : undefined,
        };
    }

    function serializeUriList(stringValue: string): ReadonlyArray<string | URI> {
        return stringValue.split('\r\n').map(part => {
            if (part.startsWith('#')) {
                return part;
            }

            try {
                return URI.parse(part);
            } catch {
                // noop
            }

            return part;
        });
    }
}

export namespace DataTransfer {
    export async function toDataTransferDTO(value: IReadonlyVSDataTransfer): Promise<DataTransferDTO> {
        return {
            items: await Promise.all(
                Array.from(value)
                    .map(
                        async ([mime, item]) => [mime, await DataTransferItem.from(mime, item)]
                    )
            )
        };
    }
}
