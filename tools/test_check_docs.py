"""Regression tests for the deterministic documentation checker."""

import contextlib
import io
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from check_docs import check
from backlinks import START as BACK_START, END as BACK_END


class DocumentationChecks(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.write('docs/00-workflow/OWNERSHIP_MAP.md', '''# Ownership Map
<!-- OWNERSHIP:START -->
| Concept | Owner | Scope |
| --- | --- | --- |
| `product.home` | `docs/home.md` | Home requirements |
<!-- OWNERSHIP:END -->
''')
        self.write('docs/home.md', '# Home\n\n### HOME-012 — Navigation\n\n[Details](details.md#behaviour)\n')
        self.write('docs/details.md', '# Details\n\n## Behaviour\n\nSome description.\n')
        self.result(write=True)

    def write(self, name, value):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(value, encoding='utf-8')

    def result(self, backlinks=False, write=False):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            status = check(self.root, backlinks, write)
        return status, output.getvalue()

    def test_valid_links_ids_and_ownership(self):
        status, output = self.result()
        self.assertEqual(status, 0, output)

    def test_broken_link_fails(self):
        self.write('docs/home.md', '# Home\n\n[Missing](not-there.md)\n')
        status, output = self.result()
        self.assertEqual(status, 1)
        self.assertIn('broken link', output)

    def test_duplicate_id_fails(self):
        self.write('docs/details.md', '## Details\n\n### HOME-012 — Duplicate\n')
        status, output = self.result()
        self.assertEqual(status, 1)
        self.assertIn('duplicate ID HOME-012', output)

    def test_missing_owner_fails(self):
        self.write('docs/00-workflow/OWNERSHIP_MAP.md', '''# Map
<!-- OWNERSHIP:START -->
| Concept | Owner | Scope |
| --- | --- | --- |
| `product.home` | `docs/missing.md` | Home |
<!-- OWNERSHIP:END -->''')
        status, output = self.result()
        self.assertEqual(status, 1)
        self.assertIn('missing/invalid Markdown owner', output)

    def test_code_fences_are_not_counted(self):
        self.write('docs/details.md', '''# Details
## Behaviour
~~~markdown
### HOME-012 — Example
[Not real](missing.md)
~~~
''')
        self.result(write=True)
        status, output = self.result()
        self.assertEqual(status, 0, output)

    def test_backlink_report(self):
        status, output = self.result(backlinks=True)
        self.assertEqual(status, 0, output)
        self.assertIn('docs/details.md <- docs/home.md', output)


    def test_generated_section_contains_relative_links(self):
        content = (self.root / 'docs/details.md').read_text(encoding='utf-8')
        self.assertIn(BACK_START, content)
        self.assertIn('- [docs/home.md](<home.md>)', content)
        self.assertIn(BACK_END, content)

    def test_regeneration_is_idempotent(self):
        before = {p: p.read_text(encoding='utf-8') for p in self.root.rglob('*.md')}
        status, output = self.result(write=True)
        self.assertEqual(status, 0, output)
        self.assertIn('Updated backlinks in 0 Markdown file(s).', output)
        self.assertEqual(before, {p: p.read_text(encoding='utf-8') for p in self.root.rglob('*.md')})

    def test_stale_backlink_fails_until_regenerated(self):
        self.write('docs/another.md', '# Another\n\n[Details](details.md)\n')
        status, output = self.result()
        self.assertEqual(status, 1)
        self.assertIn('stale backlinks', output)
        status, output = self.result(write=True)
        self.assertEqual(status, 0, output)
        content = (self.root / 'docs/details.md').read_text(encoding='utf-8')
        self.assertIn('- [docs/another.md](<another.md>)', content)

    def test_generated_links_do_not_create_false_backlinks(self):
        self.assertNotIn(BACK_START, (self.root / 'docs/home.md').read_text(encoding='utf-8'))
        status, output = self.result(backlinks=True)
        self.assertEqual(status, 0, output)
        self.assertNotIn('docs/home.md <- docs/details.md', output)

    def test_removes_backlink_block_when_last_reference_disappears(self):
        self.write('docs/home.md', '# Home\n\n### HOME-012 — Navigation\n')
        status, output = self.result(write=True)
        self.assertEqual(status, 0, output)
        self.assertNotIn(BACK_START, (self.root / 'docs/details.md').read_text(encoding='utf-8'))

    def test_invalid_markers_never_overwrite_file(self):
        file = self.root / 'docs/details.md'
        bad = file.read_text(encoding='utf-8').replace(BACK_END, '<!-- typo -->')
        file.write_text(bad, encoding='utf-8')
        status, output = self.result(write=True)
        self.assertEqual(status, 1)
        self.assertIn('backlink markers must form exactly one ordered', output)
        self.assertEqual(file.read_text(encoding='utf-8'), bad)

    def test_fenced_marker_examples_are_ignored(self):
        self.write('docs/home.md', '''# Home
### HOME-012 — Navigation
~~~markdown
<!-- GENERATED: BACKLINKS START -->
[Invalid](missing.md)
<!-- GENERATED: BACKLINKS END -->
~~~
[Details](details.md#behaviour)
''')
        self.result(write=True)
        status, output = self.result()
        self.assertEqual(status, 0, output)


if __name__ == '__main__':
    unittest.main()
