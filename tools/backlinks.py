"""Deterministic, non-normative Markdown backlink sections.

Generated links are omitted from dependency discovery by check_docs.py, so
regeneration does not create fake reciprocal dependencies.
"""

import os
from pathlib import Path
import re
from urllib.parse import quote

START = '<!-- GENERATED: BACKLINKS START -->'
END = '<!-- GENERATED: BACKLINKS END -->'
FENCE = re.compile(r'^\s*(`{3,}|~{3,})')


def marker_span(text):
    """Find one generated section outside fenced code; reject damaged markers."""
    starts, ends = [], []
    offset, fenced = 0, None
    for line in text.splitlines(keepends=True):
        m = FENCE.match(line)
        if m:
            char = m.group(1)[0]
            if fenced is None:
                fenced = char
            elif fenced == char:
                fenced = None
        elif fenced is None:
            if line.strip() == START:
                starts.append(offset)
            elif line.strip() == END:
                ends.append(offset + len(line))
        offset += len(line)
    if not starts and not ends:
        return None
    if len(starts) != 1 or len(ends) != 1 or starts[0] >= ends[0]:
        raise ValueError('backlink markers must form exactly one ordered START/END pair')
    return starts[0], ends[0]


def render(root, target, original, incoming):
    """Build desired Markdown content without changing hand-authored prose."""
    span = marker_span(original)
    if not incoming:
        if span is None:
            return original
        start, end = span
        before, after = original[:start], original[end:]
        return (before.rstrip('\n') + '\n\n' + after.lstrip('\n')
                if after.strip() else before.rstrip('\n') + '\n')

    links = []
    for source in sorted(incoming):
        relative = Path(os.path.relpath(root / source, target.parent)).as_posix()
        links.append(f'- [{source}](<{quote(relative, safe="/.-_~")}>)')
    block = START + '\n## Used by\n\n' + '\n'.join(links) + '\n' + END
    if span is not None:
        start, end = span
        return original[:start] + block + '\n' + original[end:]
    return original.rstrip('\n') + '\n\n' + block + '\n'


def maintain(root, documents, backlinks, write=False):
    """Return errors, modified-file count. documents maps Path -> original text."""
    errors, changes = [], []
    for target, original in sorted(documents.items()):
        try:
            desired = render(root, target, original, backlinks.get(target, set()))
        except ValueError as exc:
            errors.append(f'{target.relative_to(root)}: {exc}')
            continue
        if desired != original:
            changes.append((target, desired))
            if not write:
                errors.append(
                    f'{target.relative_to(root)}: stale backlinks; '
                    'run python3 tools/check_docs.py --write-backlinks'
                )
    if write and not errors:
        for target, desired in changes:
            target.write_text(desired, encoding='utf-8')
    return errors, len(changes) if write and not errors else 0
