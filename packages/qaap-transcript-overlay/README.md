# @theia/qaap-transcript-overlay

Transcript overlay kernel for Qaap mobile Work Hub:

- `WorkHubTranscriptBridge` — explicit hub surface for transcript modules
- `TranscriptOverlayState` — mutable overlay state bag
- `qaap-transcript-*` rendering utilities (virtual list, scroll pin, live controller, …)

`MobileProjectsTranscript*Ui` modules and `TranscriptOverlayController` remain in `@theia/qaap-mobile-shell` until shared composer / execution-surface seams are extracted.
