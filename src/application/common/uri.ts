

export default class URI {

    constructor(private uri: string) {}

    toString() {
        return this.uri
    }

    parent(): URI {
        return new URI(this.uri.substring(0, this.uri.lastIndexOf('/')))
    }

    lastSegment(): string {
        // TODO trim queries and fragments
        return this.uri.substr(this.uri.lastIndexOf('/') + 1)
    }
}