"""Publish only the reviewed entry bundle using the existing atomic release layout."""
from pathlib import Path
import argparse, datetime, hashlib, json, os, re, shutil, subprocess

PAGES = {
    'portfolio.html', 'case-daewoo-ian-35py.html', 'case-geoje-hyundai-hometown.html',
    'case-geoje-yurim-asiad-47py.html', 'case-guseo-ssangyong.html',
    'case-hwamyeong-kolong.html', 'case-hwamyeong-lottecastle.html',
    'case-mega-centum-49py.html', 'case-oryukdo-sk-view.html',
    'case-sajik-32py.html', 'case-sajik-ssangyong.html', 'case-samhan-goldenview.html',
}
FILES = PAGES | {'assets/residential-entry.css'}
UNCHANGED = ['consultation/index.html', 'reports/consultation-step-prototype-20260928/flow.js',
             'assets/site-tracking.js', 'assets/funnel-tracking.js',
             'assets/portfolio-consultation.js', 'sitemap.xml', 'feed.xml']

def sha(data):
    return hashlib.sha256(data).hexdigest()

def check_bundle(bundle):
    manifest = json.loads((bundle / 'manifest.json').read_text())
    rows = manifest['files']
    names = [row['path'] for row in rows]
    if set(names) != FILES or len(names) != len(FILES):
        raise RuntimeError('Unexpected file scope')
    for row in rows:
        if sha((bundle / row['path']).read_bytes()) != row['after_sha256']:
            raise RuntimeError('Bundle hash mismatch: ' + row['path'])
    return manifest

def check_baseline(current, manifest):
    for row in manifest['files']:
        path = current / row['path']
        if row.get('new_file'):
            if path.exists():
                raise RuntimeError('New asset already exists: ' + row['path'])
        elif sha(path.read_bytes()) != row['before_sha256']:
            raise RuntimeError('Baseline changed: ' + row['path'])

def prepare(root, bundle, commit, manifest):
    current = root / 'current'
    previous = os.readlink(current)
    if previous != manifest['expected_release'] or current.resolve().parent != (root / 'releases').resolve():
        raise RuntimeError('Active release changed')
    check_baseline(current, manifest)
    release = root / 'releases' / ('entry-' + commit[:12])
    if release.exists():
        raise RuntimeError('Release already exists; inspect the previous attempt')
    shutil.copytree(current.resolve(), release, symlinks=True)
    for row in manifest['files']:
        path = release / row['path']
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes((bundle / row['path']).read_bytes())
    for name in UNCHANGED:
        if (release / name).read_bytes() != (current / name).read_bytes():
            raise RuntimeError('Unrelated file changed: ' + name)
    check_baseline(current, manifest)
    if os.readlink(current) != previous:
        raise RuntimeError('Release changed during preparation')
    return release, previous

def switch(root, target):
    temporary = root / 'current.entry-next'
    if temporary.exists() or temporary.is_symlink():
        raise RuntimeError('Another switch is pending')
    temporary.symlink_to(target)
    os.replace(temporary, root / 'current')

def read(url):
    return subprocess.check_output(['curl', '-fsSL', '--max-time', '25', url])

def check_actual_listener(root, bundle):
    # The older preflight selects the first serve.js process, which may be the
    # separate :3023 preview. Bind this check to the actual production port.
    pids = set(subprocess.check_output(['lsof', '-t', '-iTCP:3021', '-sTCP:LISTEN'], text=True).split())
    if len(pids) != 1:
        raise RuntimeError('Expected one production listener on port 3021')
    pid = next(iter(pids))
    command = subprocess.check_output(['ps', '-p', pid, '-o', 'command='], text=True).strip()
    if str(root / 'serve.js') not in command:
        raise RuntimeError('Unexpected production listener: ' + command)
    manifest = check_bundle(bundle)
    for row in manifest['files']:
        if not row.get('new_file') and sha(read('http://127.0.0.1:3021/' + row['path'])) != row['before_sha256']:
            raise RuntimeError('Actual served baseline changed: ' + row['path'])
    print('PRODUCTION_LISTENER=' + command)
    print('ACTUAL_PORT_BASELINE_VERIFIED=12')

def publish(root, bundle, commit, read_http=read):
    if not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise RuntimeError('An exact committed version is required')
    manifest = check_bundle(bundle)
    release, previous = prepare(root, bundle, commit, manifest)
    switch(root, str(release.relative_to(root)))
    try:
        for row in manifest['files']:
            if sha(read_http('http://127.0.0.1:3021/' + row['path'])) != row['after_sha256']:
                raise RuntimeError('Serving mismatch: ' + row['path'])
    except Exception:
        switch(root, previous)
        print('ROLLED_BACK=' + previous)
        raise
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    record = {'completed_utc': now, 'commit': commit, 'previous_release': previous,
              'active_release': os.readlink(root / 'current'), 'served_files': len(manifest['files'])}
    with (root / 'deploy.log').open('a') as log:
        log.write('residential-entry ' + json.dumps(record, sort_keys=True) + '\n')
    print(json.dumps(record, sort_keys=True))
    return record

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--commit', required=True)
    parser.add_argument('--bundle', required=True, type=Path)
    parser.add_argument('--check-only', action='store_true')
    args = parser.parse_args()
    root = Path('/Volumes/DATABASE/spacebogam')
    check_actual_listener(root, args.bundle)
    if not args.check_only:
        publish(root, args.bundle, args.commit)
