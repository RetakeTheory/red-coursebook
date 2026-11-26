"""Import the 2026–2027 first-semester 毛概 bank from a Word .docx copy of the original .doc."""
import json
import re
import sys
from collections import Counter

from import_bank import KEY, NUMBER, ROOT, paragraphs

CHAPTER = re.compile(r"^(导论|第[一二三四五六七八九十]+章)\s*(.*)$")
GROUP = re.compile(r"^[一二][、．.]\s*([单多])项选择题[：:]?$")
OPTION = re.compile(r"(?<!\S)([A-EＡ-Ｅ])\s*[.．、：:]?\s*")
LETTERS = str.maketrans("ＡＢＣＤＥ", "ABCDE")
CHAPTERS = ["导论", "第一章", "第二章", "第三章", "第四章", "第五章", "第六章", "第七章", "第八章"]
PRINTED_COUNTS = [(17,11),(17,16),(21,13),(25,17),(20,18),(22,14),(36,26),(19,17),(21,10)]


def extract(path):
    chapters, questions = [], []
    counts = Counter()
    group = current = None
    for line in paragraphs(path):
        if match := CHAPTER.fullmatch(line):
            index = len(chapters)
            if index >= len(CHAPTERS) or match[1] != CHAPTERS[index]:
                raise ValueError(f"Unexpected chapter: {line}")
            chapters.append({"id":f"C{index:02d}", "label":match[1], "title":match[2].strip()})
            group = current = None
            continue
        if match := GROUP.fullmatch(line):
            group = "single" if match[1] == "单" else "multi"
            current = None
            continue
        if not chapters:
            continue
        if match := NUMBER.match(line):
            chapter = chapters[-1]["id"]
            number = int(match[1])
            counts[chapter, group] += 1
            if not group or number != counts[chapter, group]:
                raise ValueError(f"Unexpected question number: {chapter} {line}")
            current = {"id":chapter+("S" if group=="single" else "M")+f"{number:02d}",
                       "chapter":chapter,"kind":group,"number":number,"stem":line[match.end():],"options":[]}
            questions.append(current)
            continue
        if current is None:
            raise ValueError(f"Unattached paragraph: {line}")
        labels = list(OPTION.finditer(line))
        if labels and labels[0].start() == 0:
            for i, label in enumerate(labels):
                end = labels[i+1].start() if i+1 < len(labels) else len(line)
                current["options"].append({"key":label[1].translate(LETTERS), "text":line[label.end():end].strip()})
        elif not current["options"]:
            current["stem"] += "\n"+line
        else:
            current["options"][-1]["text"] += "\n"+line

    if [tuple(counts[c["id"],k] for k in ("single","multi")) for c in chapters] != PRINTED_COUNTS:
        raise ValueError("Chapter totals disagree with the source")
    for q in questions:
        stem = q["stem"].translate(LETTERS)
        keys = list(KEY.finditer(stem))
        options = "".join(o["key"] for o in q["options"])
        if len(keys)!=1 or options not in ("ABCD","ABCDE") or not all(o["text"] for o in q["options"]):
            raise ValueError(f"Invalid answer or options in {q['id']}")
        answer = re.findall("[A-E]",keys[0][1])
        if len(set(answer))!=len(answer) or not set(answer)<=set(options):
            raise ValueError(f"Invalid answer in {q['id']}")
        kind = "single" if len(answer)==1 else "multi"
        if q["kind"] != kind:
            # The printed single-choice section includes one five-option question keyed A, C, E.
            if q["id"] != "C01S17" or answer != ["A","C","E"]:
                raise ValueError(f"Unexpected answer type in {q['id']}")
            q["sourceKind"],q["kind"] = q["kind"],kind
        q["answer"] = "".join(sorted(answer))
        q["stem"] = (q["stem"][:keys[0].start()]+"（　　）"+q["stem"][keys[0].end():]).strip()
    return {"course":"毛泽东思想和中国特色社会主义理论体系概论","term":"2026 秋季",
            "chapters":chapters,"questions":questions}


if __name__=="__main__":
    bank = extract(sys.argv[1])
    (ROOT/"site"/"mao.json").write_text(json.dumps(bank,ensure_ascii=False,separators=(",",":")),encoding="utf8")
    print(len(bank["questions"]),"questions",dict(Counter(q["kind"] for q in bank["questions"])))
