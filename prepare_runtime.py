"""Prepare pinned desktop runtimes from the official release archive."""
import hashlib
import shutil
import sys
import urllib.request
from pathlib import Path
from zipfile import ZipFile

root=Path(__file__).resolve().parent
name="neutralinojs-v6.10.0.zip"
digest="e633f480737f229f582d8ec6165a52d789340950aef062560702122389f08329"
archive=Path(sys.argv[1]) if len(sys.argv)>1 else root/"build"/name
if not archive.is_file():
    if len(sys.argv)>1:raise FileNotFoundError(archive)
    archive.parent.mkdir(exist_ok=True)
    url="https://github.com/neutralinojs/neutralinojs/releases/download/v6.10.0/"+name
    with urllib.request.urlopen(url,timeout=90) as inp,archive.open("wb") as out:shutil.copyfileobj(inp,out)
if hashlib.sha256(archive.read_bytes()).hexdigest()!=digest:raise ValueError("Unexpected runtime archive digest")
folder=root/"bin";folder.mkdir(exist_ok=True)
with ZipFile(archive) as z:
    for filename in ("neutralino-win_x64.exe","neutralino-mac_universal"):
        target=folder/filename
        target.write_bytes(z.read(filename));target.chmod(0o755)
shutil.copyfile(root/"node_modules"/"@neutralinojs"/"lib"/"dist"/"neutralino.js",root/"site"/"neutralino.js")
shutil.copyfile(root/"LICENSE",root/"site"/"LICENSE.txt")
print("Prepared Windows x64 and universal macOS runtimes")
