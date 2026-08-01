#!/usr/bin/env python3
from __future__ import annotations
import json,re,urllib.parse,urllib.request,xml.etree.ElementTree as ET
from datetime import datetime,timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
QUERIES=[("간호정책","간호 정책 when:7d"),("간호인력","간호 인력 보건복지부 when:14d"),("보건의료정책","보건 의료 정책 when:7d"),("환자안전","환자 안전 정책 when:14d"),("지역보건","지역 보건 정책 when:14d")]
MAX_ITEMS=40;OUT=Path(__file__).resolve().parents[1]/"data"/"external-news.json"
def clean_title(title:str):
    title=re.sub(r"\s+"," ",title).strip()
    if " - " in title:
        head,source=title.rsplit(" - ",1);return head.strip(),source.strip()
    return title,"외부 언론·기관"
def fetch(query:str,category:str):
    url="https://news.google.com/rss/search?"+urllib.parse.urlencode({"q":query,"hl":"ko","gl":"KR","ceid":"KR:ko"})
    req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 KNA-Busan-Policy-News/2.0"})
    with urllib.request.urlopen(req,timeout=30) as response: xml=response.read()
    root=ET.fromstring(xml);rows=[]
    for item in root.findall("./channel/item"):
        title,source=clean_title(item.findtext("title") or "");link=item.findtext("link") or "";pub=item.findtext("pubDate") or ""
        try: published=parsedate_to_datetime(pub).astimezone(timezone.utc).isoformat()
        except Exception: published=""
        if title and link: rows.append({"title":title,"source":source,"link":link,"publishedAt":published,"category":category})
    return rows
def main():
    combined=[];seen=set();errors=[]
    for category,query in QUERIES:
        try:
            for row in fetch(query,category):
                key=re.sub(r"\W+","",row["title"]).lower()
                if not key or key in seen: continue
                seen.add(key);combined.append(row)
        except Exception as exc: errors.append(f"{query}: {exc}")
    combined.sort(key=lambda x:x.get("publishedAt",""),reverse=True)
    if len(combined)<3:
        print("news fetch did not produce enough items; keeping the existing file")
        for e in errors: print("warning:",e)
        if not OUT.exists(): raise SystemExit("no existing news file and fetch failed")
        return
    payload={"updatedAt":datetime.now(timezone.utc).isoformat(),"refreshHours":6,"items":combined[:MAX_ITEMS]}
    OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding="utf-8")
    print(f"wrote {len(payload['items'])} items to {OUT}")
if __name__=="__main__":main()
