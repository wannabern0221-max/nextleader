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

# 공식기관 자료와 기자가 작성한 언론기사를 함께 수집합니다.
SOURCES = [
    ("공식자료", "보건복지부", "보건복지부 간호 정책 when:14d"),
    ("공식자료", "질병관리청", "질병관리청 간호 보건 정책 when:14d"),
    ("공식자료", "정부·국회", "국회 간호법 보건의료 정책 when:14d"),
    ("언론기사", "간호정책", "간호 정책 간호사 when:7d"),
    ("언론기사", "간호인력", "간호 인력 의료현장 when:7d"),
    ("언론기사", "보건의료정책", "보건의료 정책 의료개혁 when:7d"),
    ("언론기사", "간호교육", "간호대학 간호교육 정책 when:14d"),
    ("언론기사", "부산·지역보건", "부산 간호 의료 보건 정책 when:14d"),
    ("언론기사", "환자안전", "환자 안전 간호 정책 when:14d"),
]
MAX_ITEMS = 60
OUT = Path(__file__).resolve().parents[1] / "data" / "external-news.json"


def clean_title(title: str) -> tuple[str, str]:
    title = re.sub(r"\s+", " ", title).strip()
    if " - " in title:
        head, source = title.rsplit(" - ", 1)
        return head.strip(), source.strip()
    return title, "외부 언론·기관"


def fetch(query: str, category: str, content_type: str) -> list[dict]:
    url = "https://news.google.com/rss/search?" + urllib.parse.urlencode(
        {"q": query, "hl": "ko", "gl": "KR", "ceid": "KR:ko"}
    )
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 KNA-Busan-Policy-News/3.0"},
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        xml = response.read()

    root = ET.fromstring(xml)
    rows: list[dict] = []
    for item in root.findall("./channel/item"):
        title, source = clean_title(item.findtext("title") or "")
        link = item.findtext("link") or ""
        pub = item.findtext("pubDate") or ""
        try:
            published = parsedate_to_datetime(pub).astimezone(timezone.utc).isoformat()
        except Exception:
            published = ""
        if title and link:
            rows.append(
                {
                    "title": title,
                    "source": source,
                    "link": link,
                    "publishedAt": published,
                    "category": category,
                    "contentType": content_type,
                }
            )
    return rows


def normalized_key(title: str) -> str:
    return re.sub(r"[^0-9a-z가-힣]+", "", title.lower())


def main() -> None:
    combined: list[dict] = []
    seen: set[str] = set()
    errors: list[str] = []

    for content_type, category, query in SOURCES:
        try:
            for row in fetch(query, category, content_type):
                key = normalized_key(row["title"])
                if not key or key in seen:
                    continue
                seen.add(key)
                combined.append(row)
        except Exception as exc:
            errors.append(f"{query}: {exc}")

    combined.sort(key=lambda x: x.get("publishedAt", ""), reverse=True)

    # 일부 피드가 잠시 실패해도 기존 정상 뉴스 목록을 빈 파일로 덮어쓰지 않습니다.
    if len(combined) < 5:
        print("news fetch did not produce enough items; keeping the existing file")
        for error in errors:
            print("warning:", error)
        if not OUT.exists():
            raise SystemExit("no existing news file and fetch failed")
        return

    payload = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "refreshHours": 6,
        "description": "공식기관 자료와 기자 작성 언론기사를 함께 제공합니다.",
        "items": combined[:MAX_ITEMS],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {len(payload['items'])} items to {OUT}")
    for error in errors:
        print("warning:", error)


if __name__ == "__main__":
    main()
