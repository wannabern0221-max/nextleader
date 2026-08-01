#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

QUERIES = [
    ("간호정책", "간호 정책"),
    ("보건의료정책", "보건복지부 간호 정책"),
    ("간호현장", "간호사 정책 의료"),
]
MAX_ITEMS = 30
OUT = Path(__file__).resolve().parents[1] / "data" / "external-news.json"


def clean_title(title: str) -> tuple[str, str]:
    title = re.sub(r"\s+", " ", title).strip()
    if " - " in title:
        head, source = title.rsplit(" - ", 1)
        return head.strip(), source.strip()
    return title, "외부 언론·기관"


def fetch(query: str, category: str) -> list[dict]:
    url = "https://news.google.com/rss/search?" + urllib.parse.urlencode({
        "q": query,
        "hl": "ko",
        "gl": "KR",
        "ceid": "KR:ko",
    })
    request = urllib.request.Request(url, headers={"User-Agent": "KNA-Busan-Policy-News/1.0"})
    with urllib.request.urlopen(request, timeout=25) as response:
        xml = response.read()
    root = ET.fromstring(xml)
    rows = []
    for item in root.findall("./channel/item"):
        raw_title = item.findtext("title") or ""
        title, source = clean_title(raw_title)
        link = item.findtext("link") or ""
        pub = item.findtext("pubDate") or ""
        try:
            published = parsedate_to_datetime(pub).astimezone(timezone.utc).isoformat()
        except Exception:
            published = ""
        if title and link:
            rows.append({
                "title": title,
                "source": source,
                "link": link,
                "publishedAt": published,
                "category": category,
            })
    return rows


def main() -> None:
    combined: list[dict] = []
    seen: set[str] = set()
    for category, query in QUERIES:
        try:
            for row in fetch(query, category):
                key = re.sub(r"\W+", "", row["title"]).lower()
                if key in seen:
                    continue
                seen.add(key)
                combined.append(row)
        except Exception as exc:
            print(f"warning: {query}: {exc}")
    combined.sort(key=lambda x: x.get("publishedAt", ""), reverse=True)
    payload = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "items": combined[:MAX_ITEMS],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {len(payload['items'])} items to {OUT}")


if __name__ == "__main__":
    main()
