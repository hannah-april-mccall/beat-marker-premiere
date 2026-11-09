"""Stage and sign a self-contained Premiere CEP extension on its target OS."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
VERSION = '0.6.0'


def run(command, log):
    result = subprocess.run(command, capture_output=True, text=True, timeout=300)
    log.write_text(result.stdout + result.stderr)
    if result.returncode:
        # Never include command arguments: signing commands contain a private password.
        raise RuntimeError('Adobe signing step failed. See ' + str(log))
    return result.stdout


def build(args):
    info = json.loads((args.runtime / 'runtime.json').read_text())
    target = info['platform']
    if target not in ('macos-arm64', 'windows-x64') or info['version'] != '0.4.0':
        raise ValueError('Unexpected engine release or platform.')
    if (sys.platform == 'darwin') != target.startswith('macos'):
        raise ValueError('Sign the package on the same operating system it will run on.')
    stage = ROOT / '.build' / target / 'com.hannah.beatmarker'
    if stage.exists():
        shutil.rmtree(stage)
    stage.mkdir(parents=True)
    for source in (ROOT / 'extension').rglob('*'):
        relative = source.relative_to(ROOT / 'extension')
        if any(part in ('tests', 'runtime', '__pycache__') for part in relative.parts):
            continue
        if source.is_file():
            destination = stage / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
    shutil.copytree(args.runtime, stage / 'runtime', symlinks=False)
    for entry in stage.rglob('*'):
        if entry.is_symlink() or entry.name in ('.DS_Store', '__MACOSX'):
            raise ValueError('A link or platform metadata file entered the signed package.')
    dist = ROOT / 'dist'
    dist.mkdir(exist_ok=True)
    zxp = dist / f'BeatMarker-Premiere-{VERSION}-{target}.zxp'
    # ZXPSignCmd may report success while retaining an existing output archive.
    if zxp.exists():
        zxp.unlink()
    tool = str(args.signer.resolve())
    command = [tool, '-sign', str(stage), str(zxp), str(args.certificate.resolve()), args.password_file.read_text().strip()]
    if args.timestamp:
        command += ['-tsa', args.timestamp]
    run(command, stage.parent / 'signing.log')
    run([tool, '-verify', str(zxp), '-certInfo'], stage.parent / 'signature-verification.log')
    signed = stage.parent / 'signed-extension'
    if signed.exists():
        shutil.rmtree(signed)
    with zipfile.ZipFile(zxp) as package:
        for source in stage.rglob('*'):
            if source.is_file():
                name = source.relative_to(stage).as_posix()
                with source.open('rb') as original, package.open(name) as archived:
                    if hashlib.file_digest(original, 'sha256').digest() != hashlib.file_digest(archived, 'sha256').digest():
                        raise ValueError('Signed archive differs from the staged release: ' + name)
        for item in package.infolist():
            if Path(item.filename).is_absolute() or '..' in Path(item.filename).parts:
                raise ValueError('Unsafe ZXP entry.')
        package.extractall(signed)
        if package.testzip():
            raise ValueError('ZXP archive integrity check failed.')
    if os.name != 'nt':
        for name in ('engine', 'ffmpeg', 'ffprobe'):
            executable = signed / 'runtime' / info[name]
            executable.chmod(executable.stat().st_mode | 0o755)
    run([tool, '-verify', str(signed)], stage.parent / 'extracted-signature-verification.log')
    with zxp.open('rb') as handle:
        digest = hashlib.file_digest(handle, 'sha256').hexdigest()
    zxp.with_suffix('.zxp.sha256').write_text(digest + '  ' + zxp.name + '\n')
    receipt = {'version': VERSION, 'platform': target, 'engine_version': info['version'],
               'engine_build': info['build_id'], 'zxp': str(zxp), 'sha256': digest,
               'signed_extension': str(signed), 'timestamp_requested': bool(args.timestamp),
               'signature_verified': True, 'extracted_signature_verified': True}
    (dist / f'package-{target}.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--runtime', type=Path, required=True)
    parser.add_argument('--signer', type=Path, required=True)
    parser.add_argument('--certificate', type=Path, required=True)
    parser.add_argument('--password-file', type=Path, required=True)
    parser.add_argument('--timestamp', default='http://timestamp.apple.com/ts01')
    build(parser.parse_args())
