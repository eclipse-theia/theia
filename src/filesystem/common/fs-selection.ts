import { Path } from './path';

export interface PathSelection {
    readonly path: Path
}

export namespace PathSelection {
    export function is (selection: any | undefined): selection is PathSelection {
        return !!selection && 'path' in selection
    }
}