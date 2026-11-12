"""Regression tests for the deterministic documentation checker."""

import contextlib
import io
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from check_docs import check


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

    def write(self, name, value):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(value, encoding='utf-8')

    def result(self, backlinks=False):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            status = check(self.root, backlinks)
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
        status, output = self.result()
        self.assertEqual(status, 0, output)

    def test_backlink_report(self):
        status, output = self.result(backlinks=True)
        self.assertEqual(status, 0, output)
        self.assertIn('docs/details.md <- docs/home.md', output)


if __name__ == '__main__':
    unittest.main()
