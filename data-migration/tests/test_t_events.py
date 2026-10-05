"""Tests for the pure helpers of the events transform.
Run: python -m unittest discover data-migration/tests"""
import os
import sys
import unittest
from datetime import date, datetime
from decimal import Decimal

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "etl", "transforms"))
import t_events as t  # noqa: E402


class Refs(unittest.TestCase):
    def test_fmt_ref(self):
        self.assertEqual(t.fmt_ref(358.0), "358")
        self.assertEqual(t.fmt_ref(" 184 /  23~24 "), "184 / 23~24")
        self.assertEqual(t.fmt_ref("052"), "052")
        self.assertEqual(t.fmt_ref(datetime(2024, 4, 21)), "2024-04-21")
        self.assertIsNone(t.fmt_ref(None))
        self.assertIsNone(t.fmt_ref(""))

    def test_strip_to_from(self):
        self.assertEqual(t.strip_to_from("to Satish R Padye"), "Satish R Padye")
        self.assertEqual(t.strip_to_from("From Takawale Travels"), "Takawale Travels")
        self.assertEqual(t.strip_to_from("Tony Stark"), "Tony Stark")       # 'To' inside a name is kept
        self.assertIsNone(t.strip_to_from(None))

    def test_is_num(self):
        self.assertTrue(t.is_num(0))
        self.assertTrue(t.is_num(2306.37))
        self.assertFalse(t.is_num(True))
        self.assertFalse(t.is_num("11K"))
        self.assertFalse(t.is_num(None))


class People(unittest.TestCase):
    def test_org_detection(self):
        self.assertTrue(t.is_org_name("Vyas Buildcon Pvt Ltd"))
        self.assertTrue(t.is_org_name("Chandukaka Saraf & Sons"))
        self.assertTrue(t.is_org_name("Deurukhkar & Co."))
        self.assertFalse(t.is_org_name("Col Meghan M Deshpande"))
        self.assertFalse(t.is_org_name("Asha Bankar"))
        self.assertFalse(t.is_org_name(None))

    def test_person_fields(self):
        p = t.person_of("Asha  Example", "donor", phone=9876543210.0, pan="ABCDE1234F", address=" 1, Some Road ")
        self.assertEqual(p, {"name": "Asha Example", "role": "donor", "phone": "9876543210", "pan": "ABCDE1234F",
                             "address": "1, Some Road"})

    def test_person_two_phones_and_dob(self):
        p = t.person_of("A Example", "beneficiary", phone="98213 24110 / 98331 85493", dob=date(2013, 9, 19))
        self.assertEqual(p["phone"], "9821324110")
        self.assertEqual(p["phone_alt"], "9833185493")
        self.assertEqual(p["dob"], "2013-09-19")

    def test_person_tag_suffix_removed(self):
        self.assertEqual(t.person_of("Asha Example - Prusthadan", "donor")["name"], "Asha Example")
        self.assertEqual(t.person_of("Asha Example - Donation", "donor")["name"], "Asha Example")

    def test_not_a_person(self):
        for name in ("???", "Ticket Sale", "PCF Members", "Vilas Example +3", "10 Doctors at Gaurav Sohola 2024",
                     "PCFPT - Transfer", "Pune CKP Family Public Trust", "", None):
            self.assertIsNone(t.person_of(name, "donor"), name)

    def test_org_flag(self):
        self.assertTrue(t.person_of("Example Travels", "vendor")["is_org"])
        self.assertNotIn("is_org", t.person_of("Asha Example", "vendor"))


class Gaurav2024(unittest.TestCase):
    def test_inward(self):
        self.assertEqual(t.classify_gaurav2024("Donation - Aadharstambh", "in")[:2], ("memo", "aadharstambh-2024"))
        self.assertEqual(t.classify_gaurav2024("Donation - Medical", "in")[0], "memo")
        self.assertEqual(t.classify_gaurav2024("Sale of Gauravyatra", "in")[:2], ("memo", "book-pride-of-ckp"))
        self.assertEqual(t.classify_gaurav2024("3-Vasant", "in")[:2], ("memo", "three-vasant-2024"))
        self.assertEqual(t.classify_gaurav2024("Sharad Ponkshe Talk Show Ticket Sale", "in")[:2], ("memo", "talk-show-2024"))
        self.assertEqual(t.classify_gaurav2024("Half Page Colour Adv - Pratibimb", "in"), ("income", None, None))
        self.assertEqual(t.classify_gaurav2024("Bus arrangement for 32 members", "in")[0], "income")
        self.assertEqual(t.classify_gaurav2024("Smaranika Prushthadaan - 1 page", "in")[0], "income")

    def test_outward(self):
        self.assertEqual(t.classify_gaurav2024("Mahola Aarogya Shibir, Tulsi Plants", "out")[:2], ("memo", "mahila-aarogya-shibir-2024"))
        self.assertEqual(t.classify_gaurav2024("Sinhgad Cycle Agencies (For Cycle Repairs - Project Diya)", "out")[0], "memo")
        self.assertEqual(t.classify_gaurav2024("Advance Payment for 25th May 24 talkshow", "out")[:2], ("memo", "talk-show-2024"))
        self.assertEqual(t.classify_gaurav2024("Hotel - Meal arrangement for 5th May", "out"), ("expense", None, None))
        self.assertEqual(t.classify_gaurav2024(None, "out")[0], "expense")


class Dates(unittest.TestCase):
    def test_out_of_sequence(self):
        rows = [(19, date(2022, 10, 16)), (20, date(2022, 1, 18)), (21, date(2022, 10, 18)), (22, date(2022, 10, 19))]
        self.assertEqual(t.out_of_sequence(rows), [20])

    def test_in_sequence_and_small_disorder(self):
        rows = [(1, date(2024, 11, 10)), (2, date(2024, 11, 20)), (3, date(2024, 11, 15)), (4, date(2024, 12, 8))]
        self.assertEqual(t.out_of_sequence(rows), [])

    def test_ends_are_never_flagged(self):
        self.assertEqual(t.out_of_sequence([(1, date(2020, 1, 1)), (2, date(2024, 1, 1))]), [])
        self.assertEqual(t.out_of_sequence([]), [])

    def test_header_date(self):
        self.assertEqual(t.header_date("Amount Returned on 26/Sept/22"), date(2022, 9, 26))
        self.assertEqual(t.header_date("Amount Returned on 3/Jun/23"), date(2023, 6, 3))
        self.assertEqual(t.header_date("Amount Returned on 31/Jul/2023"), date(2023, 7, 31))
        self.assertIsNone(t.header_date("Amount Returned on 19/Oct, 31/Oct, 30/Nov, 4/May"))
        self.assertIsNone(t.header_date("Total Amount Returned"))
        self.assertIsNone(t.header_date(None))


class Heads(unittest.TestCase):
    HEADER = {"G": "8 Nov Bus", "H": "Mahaprasad", "J": "Abhishek", "N": "7th Stay & Food"}

    def test_heads_of(self):
        cells = {"G": "-", "H": 450, "J": 1100, "N": 1000, "R": 2550}
        self.assertEqual(t.heads_of(cells, self.HEADER, ["G", "H", "J", "N"]),
                         [("Mahaprasad", Decimal("450")), ("Abhishek", Decimal("1100")), ("7th Stay & Food", Decimal("1000"))])

    def test_no_heads_when_only_a_total_is_typed(self):
        self.assertEqual(t.heads_of({"R": 5000}, self.HEADER, ["G", "H", "J", "N"]), [])

    def test_zero_and_missing_header(self):
        self.assertEqual(t.heads_of({"G": 0, "Q": 37000}, self.HEADER, ["G", "Q"]), [("Q", Decimal("37000"))])


if __name__ == "__main__":
    unittest.main()
