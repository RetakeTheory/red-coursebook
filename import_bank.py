"""Import the supplied Word question bank, retaining numbering and answer keys."""
import json
import re
import sys
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parent
NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
NUMBER = re.compile(r"^(\d+)\s*[.．、]\s*")
OPTION = re.compile(r"(?:^|(?<=\s))([A-E])\s*[.．、]\s*")
KEY = re.compile(r"[（(]\s*([A-E](?:[\s、,，]*[A-E])*)\s*[）)]")


def extract(path):
    with ZipFile(path) as archive:
        doc = ElementTree.fromstring(archive.read("word/document.xml"))
    questions = []
    group = None
    current = None
    for p in doc.find(NS + "body").iter(NS + "p"):
        line = "".join((e.text or "") if e.tag == NS+"t" else " " if e.tag in (NS+"tab",NS+"br") else "" for e in p.iter()).strip()
        if not line:
            continue
        if line in ("单选题", "多选题"):
            group = {"单选题": "single", "多选题": "multi"}[line]
            current = None
            continue
        if not group:
            continue
        numbered = NUMBER.match(line)
        if numbered:
            no = int(numbered[1])
            current = dict(id=("S" if group=="single" else "M")+f"{no:02d}", kind=group, number=no,
                           stem=line[numbered.end():], options=[])
            questions.append(current)
            continue
        if current is None:
            raise ValueError(f"Unattached paragraph: {line}")
        labels = list(OPTION.finditer(line))
        if labels and labels[0].start()==0:
            for i, match in enumerate(labels):
                end = labels[i+1].start() if i+1<len(labels) else len(line)
                current["options"].append({"key":match[1], "text":line[match.end():end].strip()})
        elif not current["options"]:
            current["stem"] += ("\n" if line.startswith("①") else "") + line
        else:
            current["options"][-1]["text"] += "\n" + line
    for kind, count, alphabet in (("single",70,"ABCD"),("multi",30,"ABCDE")):
        group = [q for q in questions if q["kind"]==kind]
        assert [q["number"] for q in group] == list(range(1,count+1)), (kind,[q["number"] for q in group])
        for q in group:
            options = "".join(o["key"] for o in q["options"])
            assert options==alphabet and all(o["text"] for o in q["options"]), (q["id"],options,q["options"])
            matches = list(KEY.finditer(q["stem"]))
            assert len(matches)==1,(q["id"],q["stem"])
            key = "".join(re.findall("[A-E]",matches[0][1]))
            assert len(set(key))==len(key) and set(key)<=set(alphabet) and (len(key)==1)==(kind=="single"), (q["id"],key)
            q["answer"] = "".join(sorted(key))
            q["stem"] = KEY.sub("（　　）",q["stem"])
    return {"course":"习近平新时代中国特色社会主义思想概论","term":"2026 秋季","questions":questions}


if __name__ == "__main__":
    bank = extract(sys.argv[1])
    (ROOT/"site"/"bank.json").write_text(json.dumps(bank,ensure_ascii=False,separators=(",",":")),"utf-8")
    print(len(bank["questions"]),"questions;",sum(len(q["options"]) for q in bank["questions"]),"options")
