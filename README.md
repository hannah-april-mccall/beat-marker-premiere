# Beat Marker for Premiere Pro

Find musical beats and downbeats, add numbered clip markers, and align edits to the music. Audio analysis runs on your computer using the bundled Beat This! engine and trained model.

## Install

Download the installer matching your computer from this repository's [Releases](https://github.com/hannah-april-mccall/beat-marker-premiere/releases/tag/v0.6.0) page. The green **Code → Download ZIP** button downloads source code, not the ready-to-use extension.

| Computer | Download |
| --- | --- |
| Apple Silicon Mac, macOS 14 or later | [Download for Mac](https://github.com/hannah-april-mccall/beat-marker-premiere/releases/download/v0.6.0/beat-marker-premiere-0.6.0-macos-arm64.pkg) |
| Intel or AMD Windows 64-bit PC | [Download for Windows](https://github.com/hannah-april-mccall/beat-marker-premiere/releases/download/v0.6.0/beat-marker-premiere-0.6.0-windows-x64-setup.exe) |

Quit Premiere Pro, run the installer for your own user account, then open a project and choose **Window → Extensions → Beat Marker**. The panel, analysis engine, model, FFmpeg and FFprobe are included. You do not need Python, Blender, a ZXP installer or PlayerDebugMode.

These installers target Premiere Pro 2025 and later with CEP 12. Intel Macs and Windows ARM are not included in this release. See [installation instructions](docs/INSTALLATION.md) for paths and removal.

**Signing:** the Adobe CEP extension is signed and verified. The native installer wrappers do not yet have Apple Developer ID/notarisation or Windows Authenticode publisher signatures. Operating-system download warnings are separate from Adobe's extension verification. Public distribution with the usual verified-publisher experience needs those additional signing identities.

## Use

1. Select the music clip on your timeline and click **Analyse selected clip**. Timing can recover a consistent pulse or follow the detected performance.
2. Choose which beats to mark, then **Add clip markers**. Names use a crotchet and the beat number, for example **♩ 1** and **♩ 3**. Markers belong to the music's project item and follow its source timing; repeated instances of that source share its markers.
3. In **Align edits**, choose the video track or selected clips, the adjustment mode, source anchor, frame threshold and optional ripple. Preview the proposed changes, then apply.

Alignment uses this tool’s beat markers on music clips in the active sequence. It maps every music clip’s source markers into its current timeline position, so multiple songs can supply beats. Clip offsets and source in-points are accounted for. Music must be a forward, normal-speed file clip; render retimed or nested music to a normal audio file first. Rate stretch modes are available alongside normal trims.

**Remove from selected** removes only this tool's beat markers on selected music sources. **Undo** in each section restores the previous whole marker or alignment operation. CEP cannot make the entire operation one native Premiere Ctrl/Cmd+Z step; use the panel's Undo buttons.

Beat detection and bar numbering are estimates. Review difficult intros, variable tempo, syncopation and unusual metres before committing an edit. Marker placement is rounded to sequence frames.

## Project

- `extension/`: CEP panel, ExtendScript host integration and JavaScript tests.
- `engine/`: standalone background analysis worker and rhythm recovery.
- `installer/`: per-user Mac and Windows installer sources.
- `scripts/`: reproducible runtime and package builders.
- `tests/`: relocated-runtime and signed-folder integration checks.

See [building](docs/BUILDING.md) and [third-party notices](THIRD_PARTY_NOTICES.md). Build outputs, signing credentials, analysis caches, private media and Premiere projects are excluded from source control. The extension is MIT licensed; redistributed components retain their own licences.
