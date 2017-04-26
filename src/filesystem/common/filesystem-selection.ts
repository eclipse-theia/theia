import { Path } from './path';

export interface PathSelection {
    readonly path: Path
}

export namespace PathSelection {
    export function is(selection: any): selection is PathSelection {
        return !!selection && 'path' in selection
    }
}

export interface UriSelection {
    readonly uri: string
}

export namespace UriSelection {
    export function is(selection: any): selection is UriSelection {
        return !!selection && 'uri' in selection
    }
}