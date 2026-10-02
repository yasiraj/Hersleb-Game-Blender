"""Publish the tested static game to the authorised existing GitHub repository."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = 'yasiraj/Hersleb-Game-Blender'
REMOTE = f'https://github.com/{REPOSITORY}.git'
TOKEN = os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN')
if not TOKEN:
    raise SystemExit('A provided GitHub credential is required; no credential is stored by this script.')

def run(*arguments, cwd=ROOT, capture=False):
    result = subprocess.run(arguments, cwd=cwd, check=True, text=True,
                            stdout=subprocess.PIPE if capture else None)
    return result.stdout.strip() if capture else None

def api(path, method='GET', data=None, allow_not_found=False):
    body = json.dumps(data).encode() if data is not None else None
    request = urllib.request.Request('https://api.github.com' + path, data=body, method=method,
        headers={'Authorization': 'Bearer ' + TOKEN, 'Accept': 'application/vnd.github+json',
                 'Content-Type': 'application/json', 'User-Agent': 'Hersleb-Pages-deployment',
                 'X-GitHub-Api-Version': '2022-11-28'})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = response.read()
            return json.loads(payload) if payload else None
    except urllib.error.HTTPError as error:
        if allow_not_found and error.code == 404:
            return None
        raise RuntimeError(f'GitHub API {method} {path}: HTTP {error.code}: '
                           + error.read(1500).decode()) from None

dist = ROOT / 'dist'
required = ['index.html', 'models/environment.glb', 'models/environment.json',
            'models/enemy.glb', 'models/player-hands.glb', 'THIRD_PARTY_NOTICES.txt']
if not all((dist / name).is_file() for name in required):
    raise SystemExit('Build and validate the static site before publishing it.')

source_commit = run('git', 'rev-parse', 'HEAD', capture=True)
branch_ref = run('git', 'ls-remote', REMOTE, 'refs/heads/gh-pages', capture=True)
temporary_root = '/workspace/shared' if Path('/workspace/shared').is_dir() else None
publish_dir = Path(tempfile.mkdtemp(prefix='hersleb-pages-', dir=temporary_root))
if branch_ref:
    run('git', 'clone', '--depth', '1', '--single-branch', '--branch', 'gh-pages',
        REMOTE, str(publish_dir))
    for path in publish_dir.iterdir():
        if path.name == '.git':
            continue
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink()
else:
    run('git', 'init', '--initial-branch=gh-pages', str(publish_dir))
    run('git', 'remote', 'add', 'origin', REMOTE, cwd=publish_dir)
for key in ('user.name', 'user.email'):
    identity = run('git', 'config', '--get', key, capture=True)
    run('git', 'config', key, identity, cwd=publish_dir)
shutil.copytree(dist, publish_dir, dirs_exist_ok=True)
(publish_dir / '.nojekyll').write_text('')
(publish_dir / 'deployment.json').write_text(json.dumps(
    {'source_repository': REPOSITORY, 'source_commit': source_commit}, indent=2) + '\n')
run('git', 'add', '--all', cwd=publish_dir)
changed = subprocess.run(['git', 'diff', '--cached', '--quiet'], cwd=publish_dir).returncode
if changed:
    run('git', 'commit', '-m', f'Publish tested Hersleb game from {source_commit[:12]}', cwd=publish_dir)
run('git', 'push', 'origin', 'HEAD:refs/heads/gh-pages', cwd=publish_dir)

endpoint = f'/repos/{REPOSITORY}/pages'
page = api(endpoint, allow_not_found=True)
settings = {'build_type': 'legacy', 'source': {'branch': 'gh-pages', 'path': '/'}}
if page is None:
    page = api(endpoint, method='POST', data=settings)
elif page.get('source') != settings['source'] or page.get('build_type') != 'legacy':
    page = api(endpoint, method='PUT', data=settings)
print('GITHUB_PAGES_CONFIGURED', json.dumps(
    {key: page.get(key) for key in ('html_url', 'status', 'build_type', 'source')}, ensure_ascii=False))
print('STATIC_BRANCH', run('git', 'rev-parse', 'HEAD', cwd=publish_dir, capture=True))
print('RETAINED_DEPLOYMENT_CHECKOUT', publish_dir)
