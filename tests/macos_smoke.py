"""Launch the universal bundle and exercise restored windows and native title-bar dragging."""
from contextlib import contextmanager
from pathlib import Path
import hashlib
import json
import os
import plistlib
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix="redcoursebook-check-") as tmp:
    root=Path(tmp)
    subprocess.run(["ditto","-x","-k",sys.argv[1],str(root)],check=True)
    app=root/"红课题本.app"
    info=plistlib.loads((app/"Contents/Info.plist").read_bytes())
    binary=app/"Contents/MacOS"/info["CFBundleExecutable"]
    assert info["CFBundleIdentifier"]=="net.reshi.redcoursebook" and os.access(binary,os.X_OK)
    assert info["CFBundleShortVersionString"]==json.loads((ROOT/"neutralino.config.json").read_text())["version"]
    subprocess.run(["codesign","--verify","--deep","--strict","--verbose=2",str(app)],check=True)
    arches=subprocess.check_output(["lipo","-archs",str(binary)],text=True).split()
    assert set(arches)=={"arm64","x86_64"}
    geometry=root/"window-check"
    subprocess.run(["xcrun","swiftc",str(ROOT/"tests/mac_window_drag.swift"),"-o",str(geometry)],check=True)
    session=root/"session"
    state=session/".tmp/window_state.config.json"
    state.parent.mkdir(parents=True)

    @contextmanager
    def launch(frame):
        state.write_text(json.dumps(dict(frame,maximize=False)))
        with socket.socket() as sock:
            sock.bind(("127.0.0.1",0));port=sock.getsockname()[1]
        proc=subprocess.Popen([str(binary),f"--port={port}",f"--path={session}","--data-location=app",
                               "--storage-location=app"],cwd=root)
        base=f"http://127.0.0.1:{port}/"
        try:
            for _ in range(100):
                if proc.poll() is not None:raise RuntimeError("Desktop application exited early")
                try:
                    with urllib.request.urlopen(base,timeout=1) as r:page=r.read().decode()
                    if "红课题本" in page:break
                except OSError:pass
                time.sleep(.3)
            else:raise RuntimeError("Desktop application did not start")
            yield proc,base
        finally:
            if proc.poll() is None:proc.terminate()
            else:print("Desktop process exited with status",proc.returncode,flush=True)
            proc.wait(timeout=10)

    with launch(dict(x=-480,y=75,width=2480,height=1620)) as (proc,base):
        assets=["bank.json","mao.json","app.mjs","mac-window.mjs","style.css","reshi.jpg","miraitowa.jpg","ailing.jpg","LICENSE.txt"]
        assets.extend(f"reshi-{size}.png" for size in [44,88,132,176])
        for asset in assets:
            with urllib.request.urlopen(base+asset,timeout=5) as r:served=r.read()
            assert served==(ROOT/"site"/asset).read_bytes(),asset
        subprocess.run([str(geometry),str(proc.pid),"restore"],check=True)
    with launch(dict(x=92,y=90,width=720,height=510)) as (proc,_):
        subprocess.run([str(geometry),str(proc.pid),"drag"],check=True)
    print("Verified the native title-bar drag, oversized saved frame, both architectures, signature and assets.",flush=True)
