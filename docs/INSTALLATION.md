# Installation

The installers include the complete offline analysis engine. You do not need Python, FFmpeg, Blender or PlayerDebugMode. Internet access is not needed for audio analysis.

The Adobe extension is signed and verified. The Mac and Windows installers use the free distribution option: they have no operating-system publisher signatures, and the Mac package is not notarised by Apple. Security warnings may therefore appear when you download or open them. Download installers only from this repository's [Releases page](https://github.com/hannah-april-mccall/beat-marker-premiere/releases/tag/v0.6.0).

## Windows

1. Download `beat-marker-premiere-0.6.0-windows-x64-setup.exe` from Releases to your PC.
2. Close Premiere Pro completely.
3. Open the installer. If Windows shows **Windows protected your PC**, click **More info**.
4. Check that the app name matches the Beat Marker installer you downloaded from this repository. **Unknown publisher** is expected for this unsigned installer. If you trust that download, click **Run anyway**. If no warning appears, continue straight to the wizard.
5. Follow the installer wizard. It installs for the account you are using; the installer does not request administrator access, although your computer's security policy may require IT approval.
6. Open Premiere, open a project, and choose **Window → Extensions → Beat Marker**.
7. Select a timeline music clip and click **Analyse selected clip**.

If **Run anyway** is missing, Windows Smart App Control or your organisation's security policy may block unsigned software. Contact your IT administrator for an approved installation method; do not disable those protections. A specific malware or antivirus alert is different from an unrecognised-publisher warning: stop and check the exact message before continuing. See [Microsoft's explanation of SmartScreen](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).

The extension installs in `%APPDATA%\Adobe\CEP\extensions\com.hannah.beatmarker`. Analysis data and Undo receipts are saved separately in `%APPDATA%\Beat Marker\Premiere`.

To update, close Premiere and run the newer installer. To remove, close Premiere and uninstall **Beat Marker for Premiere Pro** from Windows' installed apps. Saved analysis data is preserved.

## Mac

Use `beat-marker-premiere-0.6.0-macos-arm64.pkg` on an Apple Silicon Mac running macOS 14 or later.

1. Download the package from Releases and close Premiere Pro completely.
2. Open the package. If macOS says the developer cannot be verified or Apple cannot check it for malicious software, dismiss the message without moving the package to the Bin.
3. Open **Apple menu → System Settings → Privacy & Security** and scroll to the **Security** section.
4. Find the message about the Beat Marker package you just tried to open and click **Open Anyway**. Confirm the prompt and authenticate if asked. This option is normally available for about an hour after the blocked attempt; try opening the package again if the notice has expired.
5. Follow the installer to install for your user account. If no warning appeared, go straight through the installer normally.
6. Restart Premiere, open a project and choose **Window → Extensions → Beat Marker**.
7. Select a timeline music clip and click **Analyse selected clip**.

Only approve the specific package downloaded from this repository. These steps do not require turning off Gatekeeper or changing Premiere's PlayerDebugMode. If **Open Anyway** is unavailable on a managed Mac, contact your IT administrator. If macOS instead reports that the file contains malware or is damaged, stop and check the download and exact message; these steps are for an unidentified-developer or missing-notarisation warning. See [Apple's instructions for opening downloaded software](https://support.apple.com/en-gb/102445).

The extension installs in `~/Library/Application Support/Adobe/CEP/extensions/com.hannah.beatmarker`. Analysis data is stored in `~/Library/Application Support/Beat Marker/Premiere`.

To update, close Premiere and install the newer package. To remove, close Premiere and run `remove-beat-marker-premiere-macos.pkg`. Saved analysis data is preserved.

An update or the removal package may need its own warning approval using the same steps above.

## If the panel is missing

Open a project first; Premiere disables Extensions on its Home screen. Confirm you installed using the same user account as Premiere and that you chose the correct platform. Restart Premiere after installing or updating. Do not edit files inside the installed signed extension: that invalidates its Adobe signature.

Existing installations are moved to a backup within Beat Marker's user-data folder before replacement. Removal also moves the extension out of Adobe's extension folder, retaining a recoverable copy. User media and Premiere projects are never bundled or removed.
