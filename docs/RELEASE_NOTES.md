# Beat Marker 0.6.0 — Premiere Pro

Self-contained CEP installers for Apple Silicon Macs and Intel/AMD Windows PCs. Includes the offline background engine, model, private Python runtime, FFmpeg and FFprobe. Users do not need a separate Python/FFmpeg installation or PlayerDebugMode.

The Adobe CEP payloads are signed and timestamped on their respective operating systems. Native installation and Premiere loading with CEP 12 PlayerDebugMode set to `0` were checked on both platforms. Full-song analysis was checked inside Premiere on both. The Windows test also added 82 clip markers, previewed and applied seven edits, and restored the seven video clips plus their seven linked audio clips with the panel's Undo.

This prerelease uses the free distribution option. Its native installers have no Apple Developer ID/notarisation or Windows publisher signatures. Follow the security-warning steps in the installation guide; managed computers may require IT approval. Save a project copy before applying alignment.

Choose the `.pkg` for an Apple Silicon Mac, or the `windows-x64-setup.exe` for a Windows PC. Close Premiere before installing, updating or removing the extension. Read [installation instructions](INSTALLATION.md) and [verification details](TESTING.md).
