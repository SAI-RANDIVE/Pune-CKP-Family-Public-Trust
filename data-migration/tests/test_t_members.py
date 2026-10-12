"""Tests for the pure helpers of the membership transform.
Run: python -m unittest discover data-migration/tests"""
import os
import sys
import unittest
from datetime import date, datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "etl", "transforms"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "etl"))

import t_members as T  # noqa: E402


def compat(a, b):
    return T.names_compatible(T.name_tokens(a), T.name_tokens(b))


class Numbers(unittest.TestCase):
    def test_parse_number(self):
        self.assertEqual(T.parse_number("SM/24/173"), ("SM", 24, 173))
        self.assertEqual(T.parse_number(" PLM/18/001 "), ("PLM", 18, 1))
        self.assertIsNone(T.parse_number("PCF002/1"))
        self.assertIsNone(T.parse_number("Number of Active Silver Members"))
        self.assertIsNone(T.parse_number(None))

    def test_number_order_year_then_sheet_then_tier(self):
        nums = ["GM/21/010", "SM/20/003", "PLM/22/050"]
        self.assertEqual(min(nums, key=T.number_order), "SM/20/003")
        self.assertLess(T.number_order("SM/24/200", 5), T.number_order("SM/26/200", 0))

    def test_norm_tier(self):
        self.assertEqual(T.norm_tier("Silver"), ("silver", True))
        self.assertEqual(T.norm_tier(" platinum "), ("platinum", True))
        self.assertEqual(T.norm_tier("Diamond"), ("other", False))
        self.assertEqual(T.norm_tier(None), (None, True))


class Names(unittest.TestCase):
    def test_tokens_drop_honorifics_ranks_places(self):
        self.assertEqual(T.name_tokens("Mrs.Neha Kulkarni"), ("neha", "kulkarni"))
        self.assertEqual(T.name_tokens("Chi. S. N. Wadhavkar"), ("s", "n", "wadhavkar"))
        self.assertEqual(T.name_tokens("Prashant Raje, Solapur"), ("prashant", "raje"))
        self.assertEqual(T.name_tokens("Maj Gen Nitin Gadkari"), T.name_tokens("M Gen Nitin Gadkari"))
        self.assertEqual(T.name_tokens("AVM Nikhil R Chitnis"), ("nikhil", "r", "chitnis"))
        self.assertEqual(T.name_tokens("Vaijayanti (Pallavi) Gupte"), ("vaijayanti", "gupte"))
        self.assertEqual(T.name_tokens("Mrs.Medha abhayPradhan"), ("medha", "abhay", "pradhan"))
        self.assertEqual(T.name_tokens("Mrs. Ashwini Kotwal / Pradhan"), ("ashwini", "kotwal"))
        self.assertEqual(T.name_tokens("Pùrva Saini"), ("purva", "saini"))
        self.assertEqual(T.name_tokens(24447), ())
        self.assertEqual(T.name_tokens(None), ())

    def test_compatible(self):
        self.assertTrue(compat("Mr.Sandip Deshmukh", "Sandeep Deshmukh"))
        self.assertTrue(compat("Beena N Junnarkar", "Mrs. Beena Junnerkar"))
        self.assertTrue(compat("Bina N Junnarkar", "Beena Junnarkar"))
        self.assertTrue(compat("Nilesh Gupte", "Nilesh R. Gupte"))
        self.assertTrue(compat("Bhushan Kulkarni", "Hembhushan Purushottam Kulkarni"))
        self.assertTrue(compat("S. N. Wadhavkar", "Siddharth N Wadhavkar"))

    def test_not_compatible(self):
        self.assertFalse(compat("Nilesh N. Gupte", "Nilesh R. Gupte"))        # two different trustees
        self.assertFalse(compat("Meghan Deshpande", "Meghana Deshpande"))      # gendered forms
        self.assertFalse(compat("Pramod Chitnis", "Pramodini Divakar Chitnis"))
        self.assertFalse(compat("Neeta Deshpande", "Sunita Deshpande"))
        self.assertFalse(compat("Pankaj Gadkari", "Ameya Gadkari"))            # household, one phone
        self.assertFalse(compat("Purva Shringarpure", "Purva Saini"))
        self.assertFalse(compat("Shashikumar", "Shashikumar Chitnis"))         # one-word names match only themselves
        self.assertFalse(compat("", "Nilesh Gupte"))

    def test_honorific_gender(self):
        self.assertEqual(T.honorific_gender("Mrs. Pradeep Sule"), "f")
        self.assertEqual(T.honorific_gender("Mr.Pradeep Sule"), "m")
        self.assertEqual(T.honorific_gender("Smt.Ajita Chitnis"), "f")
        self.assertIsNone(T.honorific_gender("Mrunal Sule"))
        self.assertIsNone(T.honorific_gender("Col. Meghan Deshpande"))

    def test_link_by_name(self):
        cands = {1: {("nilesh", "n", "gupte")}, 2: {("nilesh", "r", "gupte")}, 3: {("monica", "pankaj", "gadkari")}}
        self.assertEqual(T.link_by_name(("nilesh", "r", "gupte"), cands), (2, "identical_name"))
        self.assertEqual(T.link_by_name(("monica", "gadkari"), cands), (3, "compatible_name"))
        self.assertEqual(T.link_by_name(("nilesh", "gupte"), cands), (None, "several_compatible"))
        self.assertEqual(T.link_by_name(("asha", "raje"), cands), (None, "no_match"))


def mention(name, number=None, phone=None, email=None, dob=None, pan=None, kind="master", sheet="S"):
    return {"file": "F", "sheet": sheet, "row": 1, "kind": kind, "name": name, "tokens": T.name_tokens(name),
            "number": number, "numparts": T.parse_number(number), "phones": [phone] if phone else [],
            "emails": [email] if email else [], "dob": dob, "pan": pan, "pan_ok": True}


class Clustering(unittest.TestCase):
    def test_shared_number_never_merges_different_names(self):
        c = T.cluster_mentions([mention("Parag Suresh Gupte", "PLM/23/064"), mention("Swati Kharkar", "PLM/23/064")])
        self.assertNotEqual(c[0], c[1])

    def test_same_person_across_number_rewrite_and_tier_change(self):
        c = T.cluster_mentions([mention("Vidya Pagnis", "SM/24/206", phone="9970000001"),
                                mention("Vidya Prashant Pagnis", "SM/25/206"),
                                mention("Mrs. Vidya P Pagnis", "GM/26/050", phone="9970000001")])
        self.assertEqual(len(set(c)), 1)

    def test_household_sharing_a_phone_stays_apart(self):
        c = T.cluster_mentions([mention("Pankaj Gadkari", "PLM/18/003", phone="8888000000", email="x@y.in"),
                                mention("Ameya Gadkari", "SM/20/006", phone="8888000000", email="x@y.in")])
        self.assertNotEqual(c[0], c[1])

    def test_ambiguous_short_name_does_not_bridge_two_people(self):
        c = T.cluster_mentions([mention("Nilesh N. Gupte", "PLM/18/005", phone="9000000001"),
                                mention("Nilesh R. Gupte", "PLM/18/002", phone="9000000002"),
                                mention("Nilesh Gupte", None, phone="9000000001"),
                                mention("Nilesh Gupte", None, phone="9000000002")])
        self.assertNotEqual(c[0], c[1])
        self.assertEqual(c[2], c[0])
        self.assertEqual(c[3], c[1])

    def test_same_name_without_shared_evidence_stays_apart(self):
        c = T.cluster_mentions([mention("Smita Girish Pradhan", "SM/21/106"),
                                mention("Smita Girish Pradhan", "SM/22/130", phone="9900000000")])
        self.assertNotEqual(c[0], c[1])

    def test_impossible_birth_year_is_not_evidence(self):
        c = T.cluster_mentions([mention("Asha Raje", "SM/20/001", dob=date(2020, 3, 30)),
                                mention("Asha Raje", "SM/22/140", dob=date(2020, 3, 30))])
        self.assertNotEqual(c[0], c[1])
        c = T.cluster_mentions([mention("Asha Raje", "SM/20/001", dob=date(1960, 3, 30)),
                                mention("Asha Raje", "SM/22/140", dob=date(1960, 3, 30))])
        self.assertEqual(c[0], c[1])

    def test_pretrust_sheets_are_two_versions_of_one_list(self):
        a = mention("Gaurang Chitnis", kind="pretrust", sheet="Member_Details")
        b = mention("Gaurang Chitnis", kind="pretrust", sheet="PCFamily_Member_Details")
        d = mention("Gaurang Chitnis", kind="pretrust", sheet="PCFamily_Member_Details")
        c = T.cluster_mentions([a, b, d])
        self.assertEqual(c[0], c[1])
        self.assertNotEqual(c[1], c[2])               # two rows of one sheet are two people


class Validity(unittest.TestCase):
    def test_ranges(self):
        for text, start, end in [
            ("1 July,2022-30 June,2023", date(2022, 7, 1), date(2023, 6, 30)),
            ("1 Feb 2022- 31 Jan 2023", date(2022, 2, 1), date(2023, 1, 31)),
            ("1st March 2022 - 28the February 2023", date(2022, 3, 1), date(2023, 2, 28)),
            ("1 Oct 2023 ~ 30th Sept 2028", date(2023, 10, 1), date(2028, 9, 30)),
            ("1.June.2023-31st May 2028", date(2023, 6, 1), date(2028, 5, 31)),
            ("1 July 2026 - 30 June2031", date(2026, 7, 1), date(2031, 6, 30)),
            ("1 May2024 - 30 Apr 2029", date(2024, 5, 1), date(2029, 4, 30)),
        ]:
            pv = T.parse_validity(text)
            self.assertEqual((pv["start"], pv["end"], pv["bad"]), (start, end, []), text)

    def test_till(self):
        self.assertEqual(T.parse_validity("Till 30 June 2027")["end"], date(2027, 6, 30))
        self.assertEqual(T.parse_validity("Till 31st March 2025")["end"], date(2025, 3, 31))
        self.assertEqual(T.parse_validity("Till14th March 2023")["end"], date(2023, 3, 14))
        self.assertEqual(T.parse_validity("Till 28 Feb 2022 silver (1Yr ) Membership")["end"], date(2022, 2, 28))
        self.assertIsNone(T.parse_validity("Till 30 June 2027")["start"])
        pv = T.parse_validity("Till December 2021 silver (1Yr ) Membership")
        self.assertEqual((pv["end"], pv["month_only"]), (date(2021, 12, 31), True))

    def test_impossible_and_misspelt_dates_are_reported_not_guessed(self):
        pv = T.parse_validity("Till 31 Nov 2023")
        self.assertIsNone(pv["end"])
        self.assertEqual(pv["bad"], ["31 Nov 2023"])
        pv = T.parse_validity("1 Dec 2023 - 30th Noiv 2028")
        self.assertEqual(pv["start"], date(2023, 12, 1))
        self.assertIsNone(pv["end"])
        self.assertTrue(pv["bad"])
        pv = T.parse_validity("15th Narch 2022 - 14th March 2023")
        self.assertIsNone(pv["start"])
        self.assertEqual(pv["end"], date(2023, 3, 14))

    def test_labels(self):
        self.assertEqual(T.parse_validity("New Member Year 2023")["label_year"], 2023)
        self.assertEqual(T.parse_validity("New Memeber Year 2022")["label_year"], 2022)
        self.assertEqual(T.parse_validity("New Member year 2024")["label_year"], 2024)
        self.assertEqual(T.parse_validity("Life Member 2021")["label_year"], 2021)
        for text in ("Hon. Life Member", "Trustee", "Old Member", "PCFPT", "Renewal done Silver (1Yr) Membership",
                     "Cancelled in 2021", None, ""):
            pv = T.parse_validity(text)
            self.assertEqual((pv["start"], pv["end"], pv["label_year"], pv["bad"]), (None, None, None, []), text)

    def test_period_end(self):
        self.assertEqual(T.period_end(date(2022, 7, 1), "silver"), date(2023, 6, 30))
        self.assertEqual(T.period_end(date(2021, 10, 15), "gold"), date(2026, 10, 14))
        self.assertEqual(T.period_end(date(2024, 2, 29), "silver"), date(2025, 2, 27))

    def test_split_tier_periods(self):
        masters = [0, 1, 7, 10, 16, 19, 22]
        # renumbered between two consecutive masters: one period
        self.assertEqual(T.split_tier_periods([(7, 7, "158"), (10, 22, "159")], masters), [["158", "159"]])
        # left the tier after the first register and came back four registers later: two periods
        self.assertEqual(T.split_tier_periods([(21, 22, "224"), (0, 1, "011")], masters), [["011"], ["224"]])
        self.assertEqual(T.split_tier_periods([(0, 22, "x")], masters), [["x"]])


class Cells(unittest.TestCase):
    def test_payment_dates(self):
        got = T.payment_dates("Cash received on 22/08/2018 & deposited in Bank on 24/08/2018")
        self.assertEqual([g[0] for g in got], [date(2018, 8, 22), date(2018, 8, 24)])
        self.assertEqual(T.payment_dates("Bank Transfer on 20-07-2018")[0][:2], (date(2018, 7, 20), "text"))
        self.assertEqual(T.payment_dates("Bank Transfer on 06/05/2020")[0][1], "ambiguous_dmy")
        self.assertEqual(T.payment_dates("Cheque No. 049334 of SJSB"), [])
        self.assertEqual(T.payment_dates(None), [])

    def test_payment_ref(self):
        self.assertEqual(T.payment_ref("IMPS: 205708024933 on 26/02/2022"), "205708024933")
        self.assertEqual(T.payment_ref("Cheque No. 049334 of SJSB"), "049334")
        self.assertEqual(T.payment_ref("Bank of Maharashtra Ch. No. 283205 dated 10/12/2021"), "283205")
        self.assertIsNone(T.payment_ref("Cash received on 16/12/2019"))

    def test_cell_date(self):
        self.assertEqual(T.cell_date(datetime(1965, 6, 29)), (date(1965, 6, 29), None))
        self.assertEqual(T.cell_date(12984), (date(1935, 7, 19), "serial_number"))
        self.assertEqual(T.cell_date("-"), (None, None))
        self.assertEqual(T.cell_date("Not.Avl."), (None, None))
        self.assertEqual(T.cell_date("24/15/1988"), (None, "unparsed"))
        self.assertEqual(T.cell_date("12 Aug"), (None, "unparsed"))
        self.assertEqual(T.cell_date("Feb 9, 1961"), (date(1961, 2, 9), "text"))

    def test_emails_pincode_slug(self):
        self.assertEqual(T.emails_in("a@b.com / c@d.in"), ["a@b.com", "c@d.in"])
        self.assertEqual(T.emails_in("Not available"), [])
        self.assertEqual(T.pincode_in("Paud Road, Kothrud, Pune - 411038"), "411038")
        self.assertIsNone(T.pincode_in("Flat 903, Bldg C 4, Pune"))
        self.assertEqual(T.slug("mrs neela chitre"), "mrs-neela-chitre")

    def test_next_col(self):
        self.assertEqual(T._next_col("J"), "K")
        self.assertEqual(T._next_col("Z"), "AA")
        self.assertEqual(T._next_col("J", 9), "S")


class ShiftRepair(unittest.TestCase):
    HMAP = {"number": "B", "ms_status": "C", "name": "D", "phone": "H", "email": "I", "dob": "J", "ann": "K",
            "blood": "L", "tier": "M", "period": "N", "auth": "O", "validity": "P", "remark2021": "Q",
            "remark2022": "R", "remark2023": "S"}

    def test_normal_row(self):
        rec, shift = T.map_row({"B": "SM/21/088", "J": datetime(1979, 5, 3), "M": "Silver", "N": "1 Year",
                                "P": "1 Feb 2022- 31 Jan 2023", "S": "DECEASED"}, self.HMAP)
        self.assertIsNone(shift)
        self.assertEqual((rec["tier"], rec["period"], rec["remark2023"]), ("Silver", "1 Year", "DECEASED"))

    def test_pan_shift(self):
        cells = {"B": "SM/24/999", "J": "ABCPD1234E", "K": datetime(1990, 1, 1), "L": "NA", "M": "O+ve", "N": "Silver",
                 "O": "1Year", "P": "PCFPT", "Q": "New Member year 2024", "S": "Till 31 December 2025"}
        rec, shift = T.map_row(cells, self.HMAP)
        self.assertEqual(shift, "pan")
        self.assertEqual(rec["pan"], "ABCPD1234E")
        self.assertEqual(rec["dob"], datetime(1990, 1, 1))
        self.assertEqual((rec["blood"], rec["tier"], rec["period"], rec["auth"]), ("O+ve", "Silver", "1Year", "PCFPT"))
        self.assertEqual((rec["validity"], rec["latest"]), ("New Member year 2024", "Till 31 December 2025"))
        self.assertNotIn("remark2023", rec)

    def test_pan_shift_with_blank_pan(self):
        rec, shift = T.map_row({"B": "PLM/22/053", "K": 44077, "L": 44295, "N": "Platinum", "O": "Life Time"}, self.HMAP)
        self.assertEqual(shift, "pan")
        self.assertEqual((rec["pan"], rec["dob"], rec["tier"], rec["period"]), (None, 44077, "Platinum", "Life Time"))

    def test_age_shift(self):
        cells = {"B": "PLM/23/064", "J": 18830, "K": 72.11, "L": 44935, "N": "Silver", "O": "1 Year",
                 "P": "Hon. Life Member", "Q": "Convert to Platinum (Life Member) Membership"}
        rec, shift = T.map_row(cells, self.HMAP)
        self.assertEqual(shift, "age")
        self.assertEqual((rec["dob"], rec["ann"], rec["tier"], rec["period"]), (18830, 44935, "Silver", "1 Year"))
        self.assertEqual(rec["validity"], "Hon. Life Member")

    def test_sheet_with_pan_column_is_never_shifted(self):
        hmap = dict(self.HMAP, pan="J", dob="K", ann="L", blood="M", tier="N", period="O")
        rec, shift = T.map_row({"J": "ABCDE1234F", "N": "Gold", "O": "5 Years"}, hmap)
        self.assertIsNone(shift)
        self.assertEqual(rec["tier"], "Gold")


if __name__ == "__main__":
    unittest.main()
