/**
 * Renders sample receipts so the layout can be checked by eye after any change
 * to lib/receipt.js. Writes PDFs to the folder given as the first argument
 * (default: the system temp folder) and prints their paths.
 *
 *   node scripts/receipt-sample.mjs [output-folder]
 *
 * The samples include a deliberately worst-case receipt: very long name,
 * address, e-mail, amount and membership number, and a Devanagari name.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.argv[2] || os.tmpdir();

// lib/receipt.js is written for Next's bundler (extension-less imports), so load a
// temporary copy that plain Node can import.
const tmp = fs.mkdtempSync(path.join(root, '.receipt-sample-'));
try {
  fs.copyFileSync(path.join(root, 'lib', 'numberToWords.js'), path.join(tmp, 'numberToWords.mjs'));
  const src = fs.readFileSync(path.join(root, 'lib', 'receipt.js'), 'utf8').replace("'./numberToWords'", "'./numberToWords.mjs'");
  fs.writeFileSync(path.join(tmp, 'receipt.mjs'), src);
  process.chdir(root);
  const { generateReceiptPDF } = await import(pathToFileURL(path.join(tmp, 'receipt.mjs')).href);

  const samples = {
    'receipt-sample-membership': {
      receipt_no: 'M/26-27/032', paid_at: '2026-07-01T10:00:00Z', payer_name: 'Sample Member Name',
      payer_address: '12, Sample Society, Karve Road, Kothrud, Pune - 411038', payer_phone: '9800000000',
      payer_email: 'member@example.com', amount: 1100, razorpay_payment_id: 'pay_SampleId0000001',
      towards: 'Membership Silver, New', valid_till: '2027-06-30', membership_no: 'SLV/MEM/0173',
    },
    'receipt-sample-worst-case': {
      receipt_no: 'PCFPT/RCP/2026-27/10432', paid_at: '2026-12-31T10:00:00Z',
      payer_name: 'Shrimati Sample Very Long Middle Name Hyphenated-Surname and Family (श्रीमती नमुना नाव)',
      payer_address: 'Flat No. 1204, B Wing, Sample Heights Co-operative Housing Society Limited, Opposite Sample Garden, Off Sample Road, Near Sample Chowk, Kothrud, Pune, Maharashtra - 411038',
      payer_phone: '+91 98000 00000 / 020-25430000', payer_email: 'a.very.long.sample.email.address.for.testing@some-long-domain-name.example.org',
      amount: 12345678.5, razorpay_payment_id: 'pay_SampleId0000001_long_reference_NEFT_UTR_000000000000',
      towards: 'Donation towards Dnyan Kiran Vidyarthi Sahayy Yojana and Diwali Faral', valid_till: '2031-09-30',
      membership_no: 'PLT/MEM/100234',
    },
    'receipt-sample-donation-cheque': {
      receipt_no: 'PCFPT/RCP/2026-27/0007', paid_at: '2026-08-15T10:00:00Z', payer_name: 'Sample Donor',
      payer_address: 'Pune', payer_phone: '9800000000', payer_email: 'donor@example.com', amount: 100000,
      mode: 'cheque', payment_ref: 'Chq No. 000123', drawn_on: 'Sample Bank, Kothrud Branch', towards: 'Donation',
    },
  };
  for (const [name, payment] of Object.entries(samples)) {
    const file = path.join(outDir, `${name}.pdf`);
    fs.writeFileSync(file, await generateReceiptPDF(payment));
    console.log(file);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
