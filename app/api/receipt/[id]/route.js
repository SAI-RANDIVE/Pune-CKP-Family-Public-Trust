import { getPool } from '../../../../lib/db';
import { buildReceiptFileName, generateReceiptPDF } from '../../../../lib/receipt';

export const runtime = 'nodejs';

export async function GET(_req, { params }) {
  const { id } = params;
  const pool = getPool();

  const { rows } = await pool.query(
    `select p.*, m.full_name as member_full_name, m.membership_type as member_membership_type,
            m.membership_no, m.valid_from, m.valid_till as member_valid_till,
            m.blood_group, m.date_of_birth, m.date_of_anniversary, m.pan_number
     from payments p
     left join members m on m.id = p.member_id
     where p.id = $1`,
    [id]
  );
  if (!rows.length) {
    return new Response('Receipt not found.', { status: 404 });
  }
  const payment = rows[0];
  if (payment.status !== 'paid') {
    return new Response('This payment has not been confirmed yet.', { status: 409 });
  }

  let pdfBytes = payment.receipt_pdf;
  let fileName = payment.receipt_file_name || buildReceiptFileName(payment);

  if (!pdfBytes || pdfBytes.length === 0) {
    pdfBytes = await generateReceiptPDF(payment);
    await pool.query(
      `update payments set receipt_pdf = $1, receipt_file_name = $2, receipt_generated_at = now() where id = $3`,
      [pdfBytes, fileName, id]
    );
  }

  return new Response(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  });
}
