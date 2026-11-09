# Installation

## Windows

1. Download `beat-marker-premiere-0.6.0-windows-x64-setup.exe` from Releases to your PC.
2. Close Premiere Pro completely.
3. Open the installer and follow the wizard. It installs for the account you are using; administrator access is not needed.
4. Open Premiere, open a project, and choose **Window → Extensions → Beat Marker**.
5. Select a timeline music clip and click **Analyse selected clip**.

The complete engine is included. Do not install Python, FFmpeg or Blender, and do not change PlayerDebugMode. Internet access is not needed for audio analysis.

The extension installs in `%APPDATA%\Adobe\CEP\extensions\com.hannah.beatmarker`. Analysis data and Undo receipts are saved separately in `%APPDATA%\Beat Marker\Premiere`.

To update, close Premiere and run the newer installer. To remove, close Premiere and uninstall **Beat Marker for Premiere Pro** from Windows' installed apps. Saved analysis data is preserved.

## Mac

Use `beat-marker-premiere-0.6.0-macos-arm64.pkg` on an Apple Silicon Mac running macOS 14 or later. Close Premiere, open the package and install for your user account. Restart Premiere and choose **Window → Extensions → Beat Marker** after opening a project.

The extension installs in `~/Library/Application Support/Adobe/CEP/extensions/com.hannah.beatmarker`. Analysis data is stored in `~/Library/Application Support/Beat Marker/Premiere`.

To update, close Premiere and install the newer package. To remove, close Premiere and run `remove-beat-marker-premiere-macos.pkg`. Saved analysis data is preserved.

## If the panel is missing

Open a project first; Premiere disables Extensions on its Home screen. Confirm you installed using the same user account as Premiere and that you chose the correct platform. Restart Premiere after installing or updating. Do not edit files inside the installed signed extension: that invalidates its Adobe signature.

The Adobe extension has its own verified signature. The current native installer wrappers have no OS publisher signatures or Mac notarisation. If your computer's security policy blocks an installer, use your organisation's approved software deployment process; this package does not disable security settings.

Existing installations are moved to a backup within Beat Marker's user-data folder before replacement. Removal also moves the extension out of Adobe's extension folder, retaining a recoverable copy. User media and Premiere projects are never bundled or removed.
