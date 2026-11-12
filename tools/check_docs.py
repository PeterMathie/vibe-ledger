#!/usr/bin/env python3
"""Validate Vibe Ledger's Markdown links, stable IDs, and ownership map.

Only deterministic structure is checked; semantic contradictions require review.
Use --root to validate a different checkout, e.g. a small fixture in tests.
"""

import argparse
from collections import defaultdict
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit

from backlinks import maintain, START as BACK_START, END as BACK_END

LINK = re.compile(r'!?\[[^\]\n]*\]\((<?[^)\s>]+>?)(?:\s+["\'][^"\']+["\'])?\)')
HEADING = re.compile(r'^#{1,6}\s+(.+?)(?:\s+#+)?\s*$')
REQ_ID = re.compile(r'^#{2,6}\s+([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)\s*(?:[—–:]|$)')
DOC_ID = re.compile(r'^\*\*Document ID:\*\*\s*`?([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)`?')
CONCEPT = re.compile(r'[a-z0-9]+(?:[.-][a-z0-9]+)*\Z')
START = '<!-- OWNERSHIP:START -->'
END = '<!-- OWNERSHIP:END -->'


def active_lines(text):
    """Ignore code fences so examples do not become links or live IDs."""
    in_fence = False
    marker = ''
    in_generated = False
    for number, line in enumerate(text.splitlines(), 1):
        match = re.match(r'^\s*(`{3,}|~{3,})', line)
        if match:
            chars = match.group(1)
            if not in_fence:
                in_fence, marker = True, chars[0]
            elif chars[0] == marker:
                in_fence = False
            continue
        if not in_fence:
            if line.strip() == BACK_START:
                in_generated = True
                continue
            if line.strip() == BACK_END:
                in_generated = False
                continue
            if not in_generated:
                yield number, line


def slug(text):
    text = re.sub(r'`([^`]*)`', r'\1', text).lower()
    text = re.sub(r'[^\w\-\s]', '', text, flags=re.UNICODE)
    return re.sub(r'\s+', '-', text.strip())


def anchors(path):
    result, counts = set(), defaultdict(int)
    for _, line in active_lines(path.read_text(encoding='utf-8')):
        match = HEADING.match(line)
        if match:
            base = slug(match.group(1))
            suffix = counts[base]
            counts[base] += 1
            result.add(f'{base}-{suffix}' if suffix else base)
    return result


def check_ownership(root, errors):
    path = root / 'docs/00-workflow/OWNERSHIP_MAP.md'
    if not path.is_file():
        errors.append('Missing central ownership map: docs/00-workflow/OWNERSHIP_MAP.md')
        return
    text = path.read_text(encoding='utf-8')
    if text.count(START) != 1 or text.count(END) != 1 or text.index(START) > text.index(END):
        errors.append('OWNERSHIP_MAP.md needs one ordered OWNERSHIP:START/END block')
        return
    rows = text.split(START, 1)[1].split(END, 1)[0].splitlines()
    seen, count = set(), 0
    for line in rows:
        if not line.strip().startswith('|') or line.lstrip().startswith('| ---'):
            continue
        cells = [cell.strip().strip('`') for cell in line.strip().strip('|').split('|')]
        if len(cells) != 3 or cells[0] == 'Concept':
            continue
        key, owner, _ = cells
        count += 1
        if not CONCEPT.fullmatch(key):
            errors.append(f'Invalid ownership key: {key}')
        if key in seen:
            errors.append(f'Duplicate ownership key: {key}')
        seen.add(key)
        target = (root / owner).resolve()
        if not target.is_relative_to(root) or not target.is_file() or target.suffix != '.md':
            errors.append(f'Ownership key {key} has missing/invalid Markdown owner: {owner}')
    if not count:
        errors.append('Ownership map contains no concept entries')


def check(root, report_backlinks=False, write_backlinks=False):
    root = root.resolve()
    errors = []
    check_ownership(root, errors)
    files = sorted(p for p in root.rglob('*.md') if not any(part.startswith('.') for part in p.relative_to(root).parts))
    ids = {}
    backlinks = defaultdict(set)
    anchor_cache = {}
    documents = {}
    for source in files:
        rel = source.relative_to(root).as_posix()
        documents[source] = source.read_text(encoding='utf-8')
        for number, line in active_lines(documents[source]):
            found = REQ_ID.match(line) or DOC_ID.match(line)
            if found:
                value = found.group(1)
                if value in ids:
                    errors.append(f'{rel}:{number}: duplicate ID {value}, first at {ids[value]}')
                else:
                    ids[value] = f'{rel}:{number}'
            # Inline code is explanatory, not a Markdown link.
            visible = re.sub(r'`[^`]*`', '', line)
            for match in LINK.finditer(visible):
                raw = match.group(1).strip('<>')
                parsed = urlsplit(raw)
                if parsed.scheme or parsed.netloc or raw.startswith('//'):
                    continue
                part = unquote(parsed.path)
                target = ((root / part.lstrip('/')) if part.startswith('/') else (source.parent / part)).resolve() if part else source
                if not target.is_relative_to(root) or not target.exists():
                    errors.append(f'{rel}:{number}: broken link {raw}')
                    continue
                if target.is_file() and target.suffix.lower() == '.md' and target != source:
                    backlinks[target].add(rel)
                if parsed.fragment and target.is_file() and target.suffix.lower() == '.md':
                    key = target.as_posix()
                    if key not in anchor_cache:
                        anchor_cache[key] = anchors(target)
                    if unquote(parsed.fragment).lower() not in anchor_cache[key]:
                        errors.append(f'{rel}:{number}: missing heading #{parsed.fragment} in {target.relative_to(root)}')
    if report_backlinks:
        for target, sources in sorted(backlinks.items()):
            print(f'{target.relative_to(root).as_posix()} <- {", ".join(sorted(sources))}')
    backlink_errors, updated = maintain(root, documents, backlinks, write=write_backlinks and not errors)
    errors.extend(backlink_errors)
    if write_backlinks and not errors:
        print(f'Updated backlinks in {updated} Markdown file(s).')
    print(f'Checked {len(files)} Markdown files and {len(ids)} unique IDs.')
    for error in errors:
        print('ERROR:', error)
    if not errors:
        print('Documentation structure OK.')
    return 1 if errors else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--report-backlinks', action='store_true', help='Print incoming links without editing files')
    parser.add_argument('--write-backlinks', action='store_true', help='Insert or refresh generated Used by sections')
    args = parser.parse_args()
    raise SystemExit(check(args.root, args.report_backlinks, args.write_backlinks))


if __name__ == '__main__':
    main()
