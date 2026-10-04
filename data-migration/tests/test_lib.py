"""Tests for the ETL normalisers. Run: python -m unittest discover data-migration/tests"""
import os
import sys
import unittest
from datetime import date, datetime
from decimal import Decimal

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "etl"))
import lib  # noqa: E402


class Dates(unittest.TestCase):
    def test_excel_types(self):
        self.assertEqual(lib.parse_date(datetime(2024, 5, 5, 10, 0)), (date(2024, 5, 5), None))
        self.assertEqual(lib.parse_date(45417), (date(2024, 5, 5), "serial"))

    def test_text_formats(self):
        self.assertEqual(lib.parse_date("25/12/2023"), (date(2023, 12, 25), "text"))
        self.assertEqual(lib.parse_date("25-12-23"), (date(2023, 12, 25), "text"))
        self.assertEqual(lib.parse_date("14 May 2023"), (date(2023, 5, 14), "text"))
        self.assertEqual(lib.parse_date("14th May, 2023"), (date(2023, 5, 14), "text"))
        self.assertEqual(lib.parse_date("May 14, 2023"), (date(2023, 5, 14), "text"))
        self.assertEqual(lib.parse_date("2023-05-14"), (date(2023, 5, 14), "text"))

    def test_marathi(self):
        self.assertEqual(lib.parse_date("१४ मे २०२३"), (date(2023, 5, 14), "text"))
        self.assertEqual(lib.parse_date("०५/०५/२०२४"), (date(2024, 5, 5), "text"))

    def test_ambiguous_is_flagged_and_read_day_first(self):
        self.assertEqual(lib.parse_date("03/04/2024"), (date(2024, 4, 3), "ambiguous_dmy"))

    def test_month_first_only_when_day_first_is_impossible(self):
        self.assertEqual(lib.parse_date("12/25/2023"), (date(2023, 12, 25), "text_month_first"))

    def test_garbage_is_never_guessed(self):
        self.assertEqual(lib.parse_date("New Member Year 2024"), (None, "unparsed"))
        self.assertEqual(lib.parse_date("31/02/2024"), (None, "unparsed"))
        self.assertEqual(lib.parse_date(12), (None, "unparsed"))

    def test_financial_year(self):
        self.assertEqual(lib.fy_of(date(2025, 3, 31)), "2024-25")
        self.assertEqual(lib.fy_of(date(2025, 4, 1)), "2025-26")
        self.assertEqual(lib.fy_of(date(1999, 12, 1)), "1999-00")

    def test_flags(self):
        self.assertIn("before_trust_registration", lib.date_flags(date(2016, 1, 1)))
        self.assertIn("outside_fy_2024-25", lib.date_flags(date(2025, 4, 2), "2024-25"))
        self.assertEqual(lib.date_flags(date(2024, 6, 1), "2024-25"), [])


class Amounts(unittest.TestCase):
    def test_numbers(self):
        self.assertEqual(lib.parse_amount(1000), (Decimal("1000.00"), None))
        self.assertEqual(lib.parse_amount(571893.37), (Decimal("571893.37"), None))
        self.assertEqual(lib.parse_amount(0.1 + 0.2), (Decimal("0.30"), None))

    def test_indian_text(self):
        self.assertEqual(lib.parse_amount("₹ 1,00,000/-"), (Decimal("100000.00"), "text"))
        self.assertEqual(lib.parse_amount("Rs. 500"), (Decimal("500.00"), "text"))
        self.assertEqual(lib.parse_amount("१,०००"), (Decimal("1000.00"), "text"))
        self.assertEqual(lib.parse_amount("(250)"), (Decimal("-250.00"), "text"))

    def test_never_guesses(self):
        self.assertEqual(lib.parse_amount("5000 + 200"), (None, "unparsed"))
        self.assertEqual(lib.parse_amount("paid"), (None, "unparsed"))
        self.assertEqual(lib.parse_amount(None), (None, None))

    def test_rounding_is_reported(self):
        amt, note = lib.parse_amount(49614.505)
        self.assertEqual(amt.as_tuple().exponent, -2)
        self.assertTrue(note.startswith("rounded_from:"))

    def test_money_is_two_decimals(self):
        self.assertEqual(lib.money(Decimal("5")), "5.00")
        self.assertRegex(lib.money(lib.parse_amount(123.4)[0]), r"^-?\d+\.\d{2}$")


class Identity(unittest.TestCase):
    def test_names(self):
        self.assertEqual(lib.clean_text("  Shri.  A.  B.   Gupte "), "Shri. A. B. Gupte")
        self.assertEqual(lib.name_key("Shri. A. B. Gupte"), "a b gupte")
        self.assertEqual(lib.name_key("Mrs Anagha  Gupte"), lib.name_key("anagha gupte"))
        self.assertEqual(lib.name_key("श्री. अजय गुप्ते"), "अजय गुप्ते")
        self.assertIsNone(lib.name_key("  "))

    def test_devanagari_is_nfc(self):
        # U+0958 (qa) is a composition exclusion: NFC spells it as ka + nukta, so the
        # two spellings of the same letter end up identical and names match.
        self.assertEqual(lib.clean_text("क़"), "क़")
        self.assertEqual(lib.clean_text("क़"), "क़")

    def test_phones(self):
        self.assertEqual(lib.norm_phones("+91 98220 12345"), ["9822012345"])
        self.assertEqual(lib.norm_phones(9822012345.0), ["9822012345"])
        self.assertEqual(lib.norm_phones("9822012345 / 020-25431234"), ["9822012345"])
        self.assertEqual(lib.norm_phones("9822012345, 09822054321"), ["9822012345", "9822054321"])
        self.assertEqual(lib.norm_phones("12345"), [])

    def test_pan_aadhaar_email(self):
        self.assertEqual(lib.norm_pan("abcpd1234e"), ("ABCPD1234E", True))
        self.assertEqual(lib.norm_pan("ABCD1234E"), ("ABCD1234E", False))
        self.assertEqual(lib.norm_pan("N/A"), (None, True))
        self.assertEqual(lib.norm_aadhaar("1234 5678 9012"), "123456789012")
        self.assertIsNone(lib.norm_aadhaar("1234"))
        self.assertEqual(lib.norm_email(" A.B@Gmail.com, "), "a.b@gmail.com")
        self.assertIsNone(lib.norm_email("not an email"))

    def test_modes(self):
        self.assertEqual(lib.norm_mode("By Cheque no 123"), "cheque")
        self.assertEqual(lib.norm_mode("GPay"), "upi")
        self.assertEqual(lib.norm_mode("NEFT"), "neft")
        self.assertEqual(lib.norm_mode("Cash"), "cash")
        self.assertEqual(lib.norm_mode("रोख"), "cash")
        self.assertIsNone(lib.norm_mode(""))


class StagingRules(unittest.TestCase):
    def test_sources_are_mandatory_and_keys_unique(self):
        st = lib.Staging("test")
        with self.assertRaises(ValueError):
            st.emit("expenses", "k1", {"amount": Decimal("1")}, [])
        st.emit("expenses", "k1", {"amount": Decimal("1")}, [lib.src("F001", "S", 2)])
        with self.assertRaises(ValueError):
            st.emit("expenses", "k1", {"amount": Decimal("2")}, [lib.src("F001", "S", 3)])
        self.assertEqual(st.records["expenses"]["k1"]["amount"], "1.00")


if __name__ == "__main__":
    unittest.main()
