"""Unit tests for the pure helpers of etl/transforms/t_bank.py (no files are read)."""
import os
import sys
import unittest
from datetime import date
from decimal import Decimal as D

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "etl", "transforms"))
import t_bank as T  # noqa: E402


class PdfText(unittest.TestCase):
    def test_split_pages_and_line_numbers(self):
        rows = T.split_pdf_text("--- page 1 ---\nA\n\nB\n--- page 2 ---\nC")
        self.assertEqual(rows, [("page 1", 1, "A"), ("page 1", 3, "B"), ("page 2", 1, "C")])

    def test_text_without_page_marker(self):
        self.assertEqual(T.split_pdf_text("x\ny"), [("page 1", 1, "x"), ("page 1", 2, "y")])


class Saraswat(unittest.TestCase):
    def test_tail_single_line(self):
        self.assertEqual(T.sar_branch_tail("Ledger Folio charges 118.00 75,901.39 CR"),
                         ("Ledger Folio charges", None, D("118.00"), D("75901.39")))

    def test_tail_with_cheque_number(self):
        self.assertEqual(T.sar_branch_tail("          128697 3000.00 70,986.26 CR"),
                         ("", "128697", D("3000.00"), D("70986.26")))

    def test_tail_balance_only_and_overdrawn(self):
        self.assertEqual(T.sar_branch_tail("Penal Charge 69,309.98 DR"), ("Penal Charge", None, None, D("-69309.98")))
        self.assertIsNone(T.sar_branch_tail("TD1000000001 IO: Int:771.00"))

    def test_branch_statement(self):
        text = ["Period :Account : 01/04/2022 - 31/03/2023CAGEN/1 X", "Date Particulars Instruments Dr Amount Cr Amount Total Amount",
                "Dr/Cr", "100.00 CR", "02-04-2022 Ledger Folio charges 18.00 82.00 CR", "06-04-2022 UPI/1/SUDHIR",
                "VAI/ICIC/XX1871/", "3000.00 3,082.00 CR", "PAGE   :1 Of  1", "07-04-2022 -SOMEONE", "  128697 82.00 3,000.00 CR",
                "**** END OF STATEMENT ****", "  Totals / Balance :- 100.00 3,000.00", "3,000.00 CR"]
        p = T.parse_saraswat_branch([("page 1", i + 1, t) for i, t in enumerate(text)])
        self.assertEqual(p["opening"], D("100.00"))
        self.assertEqual(p["period"], ("01/04/2022", "31/03/2023"))
        self.assertEqual(p["totals"], (D("100.00"), D("3000.00")))
        self.assertEqual(p["closing"], D("3000.00"))
        self.assertEqual([r["amount"] for r in p["rows"]], [D("18.00"), D("3000.00"), D("82.00")])
        self.assertEqual(p["rows"][1]["narration"], "UPI/1/SUDHIR VAI/ICIC/XX1871/")
        self.assertEqual(p["rows"][1]["src"], ("page 1", 6))
        self.assertEqual(p["rows"][2]["reference"], "128697")
        self.assertEqual(T.assign_sides(p["rows"], p["opening"]), [])
        self.assertEqual([(r["debit"], r["credit"]) for r in p["rows"]],
                         [(D("18.00"), None), (None, D("3000.00")), (D("82.00"), None)])

    def test_variant_line(self):
        v = T.sar_variant_line("15-05-2025 2,500.00 521,820.98 CRACH Debit:ICIPRU 15052025")
        self.assertEqual(v, (date(2025, 5, 15), D("2500.00"), D("521820.98"), "ACH Debit:ICIPRU 15052025"))
        self.assertIsNone(T.sar_variant_line("CAMS:123"))

    def test_netbank_line(self):
        self.assertEqual(T.sar_netbank_line("24/11/2024 900.00 1,32,807.32"), (date(2024, 11, 24), D("900.00"), D("132807.32"), None))
        self.assertEqual(T.sar_netbank_line("01/06/2024 -5,000.00 4,02,519.32192810"),
                         (date(2024, 6, 1), D("-5000.00"), D("402519.32"), "192810"))


class Hdfc(unittest.TestCase):
    def test_line_with_txn_date(self):
        v = T.hdfc_pdf_line("18/06/25 UPI SETTLEMENT -HFL658- 18/06/25 123456 18/06/25 2.00 10,002.00")
        self.assertEqual((v[0], v[2], v[3], v[4]), (date(2025, 6, 18), date(2025, 6, 18), D("2.00"), D("10002.00")))

    def test_wrapped_line_without_txn_date(self):
        v = T.hdfc_pdf_line("0000512345678 21/08/25 2,000.00 12,004.00")
        self.assertIsNone(v[0])
        self.assertEqual((v[2], v[3], v[4]), (date(2025, 8, 21), D("2000.00"), D("12004.00")))
        self.assertIsNone(T.hdfc_pdf_line("21/08/25 UPI-SOMEONE"))

    def test_text_date(self):
        self.assertEqual(T.hdfc_text_date("05/04/26"), date(2026, 4, 5))
        self.assertIsNone(T.hdfc_text_date("31/02/26"))


class Sbi(unittest.TestCase):
    def test_branch_row(self):
        v = T.sbi_branch_row("13-03-2026 13-03-2026 CREDIT Chq 240008 SRC PrBr 09061 24,80,000.00 24,89,981.45 CR")
        self.assertEqual(v, (date(2026, 3, 13), date(2026, 3, 13), "CREDIT Chq 240008 SRC PrBr 09061", D("2480000.00"), D("2489981.45")))
        self.assertIsNone(T.sbi_branch_row("13-03-2026 13-03-2026 CREDIT"))

    def test_web_rows(self):
        text = "04-\nMar-\n2026\n(04-\nMar-\n2026)\nCREDITChq 000006 10395 ₹ 10,000.00 ₹ 10,000.00\n13-\nMar-\n2026\n(13-\nMar-\n2026)\nCREDIT 10395 ₹\n24,80,000.00 ₹ 24,90,000.00"
        self.assertEqual(T.sbi_web_rows(text), [(date(2026, 3, 4), D("10000.00"), D("10000.00")),
                                                (date(2026, 3, 13), D("2480000.00"), D("2490000.00"))])


class RunningBalance(unittest.TestCase):
    def rows(self):
        return [{"date": date(2025, 4, 1), "debit": None, "credit": D("100"), "balance": D("600")},
                {"date": date(2025, 4, 2), "debit": D("50"), "credit": None, "balance": D("550")},
                {"date": date(2025, 4, 2), "debit": None, "credit": None, "balance": D("550")}]

    def test_clean(self):
        self.assertEqual(T.check_running_balance(self.rows(), D("500")), [])

    def test_balance_break(self):
        r = self.rows()
        r[1]["balance"] = D("540")
        f = T.check_running_balance(r, D("500"))
        self.assertEqual([(x["i"], x["kind"]) for x in f], [(1, "balance"), (2, "balance")])
        self.assertEqual(f[0]["difference"], D("-10"))

    def test_date_break(self):
        r = self.rows()
        r[2]["date"] = date(2025, 3, 31)
        self.assertEqual([(x["i"], x["kind"]) for x in T.check_running_balance(r, D("500"))], [(2, "date")])

    def test_side_from_balance(self):
        self.assertEqual(T.side_from_balance(D("100"), D("30"), D("130")), "credit")
        self.assertEqual(T.side_from_balance(D("100"), D("30"), D("70")), "debit")
        self.assertEqual(T.side_from_balance(D("100"), D("0"), D("100")), "none")
        self.assertIsNone(T.side_from_balance(D("100"), D("30"), D("120")))
        self.assertIsNone(T.side_from_balance(None, D("30"), D("120")))


class Maturity(unittest.TestCase):
    def test_simple_interest(self):
        self.assertEqual(T.simple_interest(D("2400000"), "4.9", 46), D("14821"))
        self.assertEqual(T.simple_interest(D("700000"), "3.05", 22), D("1287"))
        self.assertEqual(T.simple_interest(D("100000"), "4.25", 48), D("559"))

    def test_check_passes_on_simple_interest(self):
        c = T.maturity_check(D("50000"), D("5.25"), date(2026, 3, 17), date(2026, 4, 17), D("50223"))
        self.assertTrue(c["ok"])
        self.assertEqual(c["rule"], "simple")

    def test_check_fails_and_reports_difference(self):
        c = T.maturity_check(D("50000"), D("5.52"), date(2026, 3, 17), date(2026, 4, 17), D("50223"))
        self.assertFalse(c["ok"])
        self.assertEqual(c["difference"], D("50223") - c["expected"])

    def test_check_needs_all_inputs(self):
        self.assertIsNone(T.maturity_check(D("50000"), None, date(2026, 3, 17), date(2026, 4, 17), D("50223"))["ok"])

    def test_compound(self):
        self.assertEqual(T.compound_maturity(D("100000"), "8", date(2024, 1, 1), date(2024, 12, 31), 1), D("108000"))


class TallyGroupSummary(unittest.TestCase):
    def test_glued_line_closing_credit_opening(self):
        r = T.split_tally_summary("RESERVE & SURPLUS 1,67,122.26 Cr2,78,202.871,11,080.61 Dr")
        self.assertEqual(r, {"label": "RESERVE & SURPLUS", "closing": D("-167122.26"), "credit": D("278202.87"),
                             "debit": D("0.00"), "opening": D("111080.61")})

    def test_glued_line_four_columns(self):
        r = T.split_tally_summary("Bank Accounts 1,22,833.26 Dr18,10,662.1318,57,476.0076,019.39 Dr")
        self.assertEqual((r["closing"], r["credit"], r["debit"], r["opening"]),
                         (D("122833.26"), D("1810662.13"), D("1857476.00"), D("76019.39")))

    def test_no_closing_balance_and_label_with_digits(self):
        r = T.split_tally_summary("PNB - TD1000000001 52,933.002,933.0050,000.00 Dr")
        self.assertEqual((r["label"], r["closing"], r["credit"], r["debit"], r["opening"]),
                         ("PNB - TD1000000001", D("0.00"), D("52933.00"), D("2933.00"), D("50000.00")))

    def test_single_movement_side_from_arithmetic(self):
        self.assertEqual(T.split_tally_summary("Deposits (Asset) 5,000.00 Dr5,000.00")["debit"], D("5000.00"))
        self.assertEqual(T.split_tally_summary("Membership 1,84,200.00 Cr60,450.001,23,750.00 Cr")["credit"], D("60450.00"))

    def test_rejects_rows_that_do_not_add_up_or_are_badly_grouped(self):
        self.assertIsNone(T.split_tally_summary("RESERVE & SURPLUS 1,67,122.26 Cr2,78,202.871,11,080.62 Dr"))
        self.assertIsNone(T.split_tally_summary("X 87111080.61 Dr"))
        self.assertIsNone(T.split_tally_summary("X 871,11,080.61 Dr871,11,080.61 Dr"))
        self.assertIsNone(T.split_tally_summary("Group Summary"))


class Numbers(unittest.TestCase):
    def test_fd_norm(self):
        self.assertEqual(T.fd_norm("TD1002060293"), "1002060293")
        self.assertEqual(T.fd_norm(" TD : 45029828993"), "45029828993")
        self.assertEqual(T.fd_norm("00000045319956381"), "45319956381")
        self.assertEqual(T.fd_norm(50301172876351.0), "50301172876351")
        self.assertEqual(T.fd_norm("A5058228"), "A5058228")
        self.assertIsNone(T.fd_norm(None))

    def test_pct_and_mask(self):
        self.assertEqual(T.pct(0.0525), D("5.250"))
        self.assertEqual(T.pct(0.1), D("10.000"))
        self.assertEqual(T.mask("1002060293"), "…0293")

    def test_signed_balance_and_gpay_time(self):
        self.assertEqual(T.signed_balance("1,01,054.27", "DR"), D("-101054.27"))
        self.assertEqual(T.gpay_time("17-05-26 9:39"), date(2026, 5, 17))
        self.assertEqual(T.register_bank("Punjab National Bank"), "pnbhfl")


if __name__ == "__main__":
    unittest.main()
