"""Fetch only public logo artwork, never the bookmark export itself."""
from pathlib import Path
import base64
import io
import json
import re
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parent
SOURCES = ROOT / 'sources'
SOURCES.mkdir(parents=True, exist_ok=True)
provenance = []


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'MarkPad-IconStudy/1.0'})
    with urllib.request.urlopen(req, timeout=40) as response:
        return response.read()


def save(name, data, source, note):
    (SOURCES / name).write_bytes(data)
    provenance.append({'file': f'sources/{name}', 'source': source, 'note': note})


package_url = 'https://registry.npmjs.org/@lobehub/icons-static-svg/-/icons-static-svg-1.95.1.tgz'
with tarfile.open(fileobj=io.BytesIO(fetch(package_url)), mode='r:gz') as archive:
    for source_name, target in {
        'openai.svg': 'chatgpt.svg',
        'deepseek-color.svg': 'deepseek.svg',
        'github.svg': 'github.svg',
        'bilibili-color.svg': 'bilibili.svg',
        'tencentcloud-color.svg': 'tencentcloud.svg',
    }.items():
        save(target, archive.extractfile('package/icons/' + source_name).read(), package_url,
             f'Lobe Icons 1.95.1, package/icons/{source_name}; MIT code license; brand marks remain their owners\' property.')
    for name in archive.getnames():
        if name.lower().endswith('/license'):
            (SOURCES / 'lobe-icons-LICENSE').write_bytes(archive.extractfile(name).read())
            break
if not (SOURCES / 'lobe-icons-LICENSE').exists():
    (SOURCES / 'lobe-icons-LICENSE').write_bytes(fetch('https://raw.githubusercontent.com/lobehub/lobe-icons/master/LICENSE'))

save('huggingface.svg', fetch('https://huggingface.co/datasets/huggingface/brand-assets/resolve/main/hf-logo.svg'),
     'https://huggingface.co/brand', 'Official brand artwork.')
save('outlook.svg', fetch('https://raw.githubusercontent.com/simple-icons/simple-icons/11.15.0/icons/microsoftoutlook.svg'),
     'https://github.com/simple-icons/simple-icons/blob/11.15.0/icons/microsoftoutlook.svg',
     'Simple Icons 11.15.0, CC0 path data; classic Outlook silhouette retained for this study.')
save('youtube.svg', fetch('https://raw.githubusercontent.com/simple-icons/simple-icons/16.35.0/icons/youtube.svg'),
     'https://github.com/simple-icons/simple-icons/blob/16.35.0/icons/youtube.svg',
     'Simple Icons 16.35.0, CC0 path data.')
local_logo = ROOT.parents[2] / 'VisionGuard' / 'icon' / 'visionguard-icon-light.svg'
save('visionguard.svg', local_logo.read_bytes(), 'VisionGuard/icon/visionguard-icon-light.svg',
     'Existing project artwork; copied without changing the other repository.')

page = fetch('https://www.123pan.com/').decode('utf-8')
match = re.search(r'<img[^>]+src="data:image/png;base64,([^"]+)"', page)
save('123pan-reference.png', base64.b64decode(match.group(1)), 'https://www.123pan.com/',
     'Official header artwork; reference for editable geometric reconstruction, not a final icon.')
save('gmail-reference.png', fetch('https://www.gstatic.com/images/branding/product/2x/gmail_2020q4_48dp.png'),
     'https://www.gstatic.com/images/branding/product/2x/gmail_2020q4_48dp.png',
     'Official product image; reference for editable geometric reconstruction.')
save('figma-reference.svg', fetch('https://static.figma.com/app/icon/1/favicon.svg'),
     'https://static.figma.com/app/icon/1/favicon.svg', 'Official product favicon.')

(ROOT / 'sources.json').write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Prepared {len(provenance)} logo references.')
