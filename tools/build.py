#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把单文件离线存档 googology_wiki.html 重构成适合 GitHub Pages 的静态站点。

输出结构（OUT_DIR）：
  index.html            入口（仅骨架，几 KB）
  assets/style.css      样式
  assets/app.js         路由 / 渲染 / 搜索
  assets/vendor/mathjax.js   MathJax bundle（按需加载）
  assets/img/xx/hash.png     页面图片（base64 还原）
  data/index.json       页面索引 [{id,t,ns,c}]
  data/chunks/NNN.json  页面正文分片 [{id,h}]

用法：
  python3 tools/build.py [源HTML路径] [输出目录]
"""
import base64
import hashlib
import json
import os
import re
import shutil
import sys

TARGET_CHUNK_BYTES = 1_200_000   # 单个分片目标体积（未压缩），非硬上限
MAX_CHUNK_BYTES = 3_000_000      # 软上限：超过就结束当前分片

TEMPLATE_RE = re.compile(r'<template id="(p-[^"]+)">(.*?)</template>', re.S)
IMG_RE = re.compile(r'(<img\b[^>]*?src=")data:image/([a-zA-Z0-9+.\-]+);base64,([A-Za-z0-9+/=]+)(")')


def extract_style(src: str) -> str:
    m = re.search(r'<style>(.*?)</style>', src, re.S)
    return m.group(1).strip() if m else ''


def extract_mathjax(src: str) -> str:
    """取出内嵌的 MathJax webpack bundle（体积最大的那段 script）。"""
    blocks = re.findall(r'<script>(.*?)</script>', src, re.S)
    blocks = [b for b in blocks if '__webpack_modules__' in b or 'MathJax' in b[:2000]]
    if not blocks:
        return ''
    return max(blocks, key=len).strip()


def extract_index(src: str):
    m = re.search(r'const INDEX = (\[.*?\]);', src, re.S)
    if not m:
        raise SystemExit('未能在源文件中找到 INDEX 定义')
    return json.loads(m.group(1))


def write_images(html_list, img_dir, seen):
    """把页面里的 base64 图片还原成独立文件，返回替换函数。"""
    def repl(m):
        prefix, ext, data, suffix = m.groups()
        raw = base64.b64decode(data)
        digest = hashlib.sha1(raw).hexdigest()
        rel = f'{digest[:2]}/{digest}.{"png" if ext == "png" else ext}'
        if digest not in seen:
            os.makedirs(os.path.join(img_dir, digest[:2]), exist_ok=True)
            with open(os.path.join(img_dir, rel), 'wb') as f:
                f.write(raw)
            seen[digest] = rel
        return f'{prefix}assets/img/{rel}{suffix}'
    out = []
    for h in html_list:
        out.append(IMG_RE.sub(repl, h))
    return out


def main():
    src_path = sys.argv[1] if len(sys.argv) > 1 else 'googology_wiki.html'
    out_dir = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    print(f'读取 {src_path} …')
    with open(src_path, encoding='utf-8', errors='replace') as f:
        src = f.read()

    index = extract_index(src)
    print(f'索引条目：{len(index)}')

    tmpl = {tid: body for tid, body in TEMPLATE_RE.findall(src)}
    print(f'模板数量：{len(tmpl)}')

    # 只保留索引里出现过的页面，并按索引顺序输出，保证导航顺序稳定
    pages = [p for p in index if p['id'] in tmpl]
    missing = [p['id'] for p in index if p['id'] not in tmpl]
    if missing:
        print(f'警告：{len(missing)} 个索引条目缺少正文，已跳过')

    data_dir = os.path.join(out_dir, 'data')
    chunk_dir = os.path.join(data_dir, 'chunks')
    img_dir = os.path.join(out_dir, 'assets', 'img')
    shutil.rmtree(data_dir, ignore_errors=True)
    shutil.rmtree(img_dir, ignore_errors=True)
    os.makedirs(chunk_dir, exist_ok=True)
    os.makedirs(img_dir, exist_ok=True)

    # 1) 图片外置
    bodies = [tmpl[p['id']] for p in pages]
    bodies = write_images(bodies, img_dir, {})
    print(f'图片文件：{sum(len(fs) for _, _, fs in os.walk(img_dir))} 个')

    # 2) 分片
    chunks, cur, cur_size = [], [], 0
    for page, body in zip(pages, bodies):
        size = len(body.encode('utf-8'))
        if cur and (cur_size + size > TARGET_CHUNK_BYTES or cur_size > MAX_CHUNK_BYTES):
            chunks.append(cur)
            cur, cur_size = [], 0
        page['c'] = f'{len(chunks):03d}'
        cur.append({'id': page['id'], 'h': body})
        cur_size += size
    if cur:
        chunks.append(cur)

    total = 0
    for i, chunk in enumerate(chunks):
        name = f'{i:03d}'
        path = os.path.join(chunk_dir, f'{name}.json')
        blob = json.dumps(chunk, ensure_ascii=False, separators=(',', ':'))
        with open(path, 'w', encoding='utf-8') as f:
            f.write(blob)
        total += os.path.getsize(path)
    print(f'分片：{len(chunks)} 个，合计 {total / 1024 / 1024:.1f} MB')

    meta = [{'id': p['id'], 't': p['t'], 'ns': p['ns'], 'c': p['c']} for p in pages]
    with open(os.path.join(data_dir, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump({'pages': meta, 'chunks': len(chunks)}, f, ensure_ascii=False, separators=(',', ':'))

    # 3) 静态资源
    here = os.path.dirname(os.path.abspath(__file__))
    assets = os.path.join(out_dir, 'assets')
    os.makedirs(os.path.join(assets, 'vendor'), exist_ok=True)
    with open(os.path.join(assets, 'style.css'), 'w', encoding='utf-8') as f:
        f.write(extract_style(src) + '\n' + EXTRA_CSS)
    mj = extract_mathjax(src)
    if mj:
        with open(os.path.join(assets, 'vendor', 'mathjax.js'), 'w', encoding='utf-8') as f:
            f.write(mj)
        print(f'MathJax bundle：{os.path.getsize(os.path.join(assets, "vendor", "mathjax.js")) / 1024 / 1024:.1f} MB')

    with open(os.path.join(here, 'app.js'), encoding='utf-8') as f:
        app = f.read()
    with open(os.path.join(assets, 'app.js'), 'w', encoding='utf-8') as f:
        f.write(app)

    # 4) 入口页面
    with open(os.path.join(here, 'index.template.html'), encoding='utf-8') as f:
        tpl = f.read()
    with open(os.path.join(out_dir, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(tpl)

    print('完成 →', out_dir)


EXTRA_CSS = """
/* ===== 重构版新增样式 ===== */
#topbar { position: sticky; top: 0; z-index: 10; background: var(--bg, #fff);
          border-bottom: 1px solid #a2a9b1; padding: 8px 0; margin-bottom: 1em; }
#topbar .inner { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
#topbar a.brand { font-weight: 600; font-size: 1.05em; }
#topbar input { flex: 1 1 160px; min-width: 120px; padding: 6px 8px; font-size: 1em;
                border: 1px solid #a2a9b1; border-radius: 4px; }
#topbar .btn { padding: 6px 10px; border: 1px solid #a2a9b1; border-radius: 4px;
               background: transparent; color: inherit; font-size: .9em; cursor: pointer; }
#status { font-size: .85em; color: #54595d; min-height: 1.2em; }
.snippet { font-size: .85em; color: #54595d; margin: .2em 0 .6em 1.2em; }
mark { background: #ffe08a; color: inherit; }
#list ul { margin: .2em 0 .8em; }
#list li { margin: .1em 0; }
.toc-box { background: #f8f9fa; border: 1px solid #eaecf0; padding: .8em 1em; margin: 1em 0; }
@media (prefers-color-scheme: dark) {
  #topbar { background: #1a1a1a; }
  .toc-box { background: #2a2a2a; border-color: #444; }
  mark { background: #7a5c00; }
}
"""


if __name__ == '__main__':
    main()
