"""Create native current-user installers; no administrator or debug-mode setting."""
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / '.build/macos-installer'
DIST = ROOT / 'dist'


def run(command):
    subprocess.run([str(x) for x in command], check=True, cwd=ROOT)


def distribution(package, title, welcome):
    return f'''<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="2">
  <title>{title}</title>
  <domains enable_anywhere="false" enable_currentUserHome="true" enable_localSystem="false"/>
  <options customize="never" hostArchitectures="arm64"/>
  <allowed-os-versions><os-version min="14.0"/></allowed-os-versions>
  <welcome file="{welcome}" mime-type="text/html"/>
  <choices-outline><line choice="default"/></choices-outline>
  <choice id="default" visible="false"><pkg-ref id="com.hannah.beatmarker.premiere"/></choice>
  <pkg-ref id="com.hannah.beatmarker.premiere" version="0.6.0" auth="none">{package}</pkg-ref>
</installer-gui-script>
'''


def main():
    BUILD.mkdir(parents=True, exist_ok=True)
    DIST.mkdir(exist_ok=True)
    resources = BUILD / 'resources'
    resources.mkdir(exist_ok=True)
    (resources / 'welcome.html').write_text('<html><body><h1>Beat Marker for Premiere Pro</h1><p>Quit Premiere Pro, then continue to install Beat Marker for your Mac user account.</p><p>The signed Adobe panel, trained model and complete offline analysis engine are included. No Python, FFmpeg, administrator access or PlayerDebugMode setting is needed.</p><p>After installation, open Premiere Pro and choose Window → Extensions → Beat Marker.</p></body></html>')
    (resources / 'remove.html').write_text('<html><body><h1>Remove Beat Marker</h1><p>Quit Premiere Pro, then continue to remove the panel from this Mac user account. Your analysis cache and Undo records are preserved.</p></body></html>')
    payload = BUILD / 'payload'
    if payload.exists():
        shutil.rmtree(payload)
    payload.mkdir()
    shutil.copytree(ROOT / '.build/macos-arm64/signed-extension', payload / 'com.hannah.beatmarker', symlinks=False)
    scripts = BUILD / 'scripts'
    scripts.mkdir(exist_ok=True)
    for name in ('preinstall', 'postinstall'):
        shutil.copy2(ROOT / 'installer/macos' / name, scripts / name)
        (scripts / name).chmod(0o755)
    component = BUILD / 'component.pkg'
    run(['/usr/bin/pkgbuild', '--root', payload, '--install-location', '/Library/Application Support/Adobe/CEP/extensions', '--identifier', 'com.hannah.beatmarker.premiere', '--version', '0.6.0', '--scripts', scripts, component])
    definition = BUILD / 'Distribution.xml'
    definition.write_text(distribution('component.pkg', 'Beat Marker for Premiere Pro', 'welcome.html'))
    run(['/usr/bin/productbuild', '--distribution', definition, '--package-path', BUILD, '--resources', resources, DIST / 'beat-marker-premiere-0.6.0-macos-arm64.pkg'])
    removal = BUILD / 'removal-scripts'
    removal.mkdir(exist_ok=True)
    shutil.copy2(ROOT / 'installer/macos/remove', removal / 'postinstall')
    (removal / 'postinstall').chmod(0o755)
    run(['/usr/bin/pkgbuild', '--nopayload', '--identifier', 'com.hannah.beatmarker.premiere', '--version', '0.6.0', '--scripts', removal, BUILD / 'remove-component.pkg'])
    definition.write_text(distribution('remove-component.pkg', 'Remove Beat Marker for Premiere Pro', 'remove.html'))
    run(['/usr/bin/productbuild', '--distribution', definition, '--package-path', BUILD, '--resources', resources, DIST / 'remove-beat-marker-premiere-macos.pkg'])


if __name__ == '__main__':
    main()
