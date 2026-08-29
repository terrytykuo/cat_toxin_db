"""Unit tests for dump_firestore field stripping and the unknown-field guard.

Run from the repo root:
    python3 -m unittest discover -s pipeline -p 'test_*.py'
"""
import unittest

from dump_firestore import (
    FIRESTORE_ONLY_FIELDS,
    find_unknown_fields,
    load_allowed_fields,
    strip_firestore_only,
)


class StripFirestoreOnlyTests(unittest.TestCase):
    def test_l10n_is_a_firestore_only_field(self):
        self.assertIn("l10n", FIRESTORE_ONLY_FIELDS)

    def test_strip_removes_l10n_and_classic_fields(self):
        doc = {
            "name": "Peppermint",
            "id": "x",
            "imageUrls": [],
            "hidden": False,
            "l10n": {"zh-TW": {"name": "薄荷"}},
        }
        stripped = strip_firestore_only(doc)
        self.assertEqual(stripped, {"name": "Peppermint"})


class LoadAllowedFieldsTests(unittest.TestCase):
    def test_resolves_root_ref(self):
        # Mirrors toxin.disk.schema.json's actual shape: root is a $ref into definitions.
        schema = {
            "$ref": "#/definitions/ToxinDisk",
            "definitions": {"ToxinDisk": {"properties": {"name": {}, "severity": {}}}},
        }
        self.assertEqual(load_allowed_fields(schema), {"name", "severity"})

    def test_plain_root_properties(self):
        self.assertEqual(load_allowed_fields({"properties": {"a": {}}}), {"a"})


class UnknownFieldGuardTests(unittest.TestCase):
    ALLOWED = {"name", "category", "severity", "description"}

    def test_known_fields_pass(self):
        payload = {"name": "Peppermint", "severity": "cautious"}
        self.assertEqual(find_unknown_fields(payload, self.ALLOWED), [])

    def test_unknown_field_is_flagged(self):
        payload = {"name": "Peppermint", "some_new_firestore_field": 1}
        self.assertEqual(
            find_unknown_fields(payload, self.ALLOWED),
            ["some_new_firestore_field"],
        )


if __name__ == "__main__":
    unittest.main()
