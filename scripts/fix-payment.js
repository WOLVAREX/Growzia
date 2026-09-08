require('dotenv/config');
const { Pool } = require('pg');

const email = process.argv[2];
const apply = process.argv.includes('--apply');

if (!email) {
  console.log('Usage: node scripts/fix-payment.js user@example.com [--apply]');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function paystackVerify(reference, method) {
  const url = method === 'mpesa'
    ? `https://api.paystack.co/charge/${encodeURIComponent(reference)}`
    : `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } });
  return res.json();
}

async function main() {
  const client = await pool.connect();
  try {
    const userRes = await client.query(
      `SELECT id, data FROM growzia_documents WHERE collection='users' AND data->>'email'=$1`,
      [email.toLowerCase()],
    );
    if (userRes.rows.length === 0) { console.log('User not found for', email); return; }
    const userRow = userRes.rows[0];
    console.log('User:', userRow.data.email, '| current balanceKes:', userRow.data.balanceKes);

    const payRes = await client.query(
      `SELECT id, data FROM growzia_documents WHERE collection='payments' AND data->>'userId'=$1 AND data->>'status'='pending' ORDER BY created_at DESC`,
      [userRow.id],
    );
    if (payRes.rows.length === 0) { console.log('No pending payments for this user.'); return; }

    console.log(`\nFound ${payRes.rows.length} pending payment(s):`);
    for (const row of payRes.rows) {
      console.log(`- ref=${row.data.reference} amount=${row.data.amountKes} method=${row.data.method} createdAt=${row.data.createdAt}`);
    }
    console.log();

    for (const row of payRes.rows) {
      const p = row.data;
      const result = await paystackVerify(p.reference, p.method);
      const paystackStatus = result?.data?.status;
      console.log(`Paystack check for ${p.reference}: status="${paystackStatus}" message="${result?.message}"`);

      if (paystackStatus !== 'success') {
        console.log('  -> Not marked successful by Paystack, skipping (not crediting).\n');
        continue;
      }

      if (!apply) {
        console.log(`  -> Would credit KES ${p.amountKes}. Re-run with --apply to actually do it.\n`);
        continue;
      }

      await client.query('BEGIN');
      try {
        const lockedPay = await client.query(
          `SELECT data FROM growzia_documents WHERE collection='payments' AND id=$1 FOR UPDATE`,
          [row.id],
        );
        const pdata = lockedPay.rows[0].data;
        if (pdata.status === 'success') {
          console.log('  -> Already credited (race with something else), skipping.\n');
          await client.query('ROLLBACK');
          continue;
        }
        pdata.status = 'success';
        pdata.paystackTransactionId = result?.data?.id ? String(result.data.id) : null;
        pdata.creditedAt = new Date().toISOString();
        pdata.gatewayResponse = result?.message || null;
        await client.query(
          `UPDATE growzia_documents SET data=$2, updated_at=now() WHERE collection='payments' AND id=$1`,
          [row.id, pdata],
        );

        const lockedUser = await client.query(
          `SELECT data FROM growzia_documents WHERE collection='users' AND id=$1 FOR UPDATE`,
          [userRow.id],
        );
        const udata = lockedUser.rows[0].data;
        udata.balanceKes = Number(udata.balanceKes || 0) + Number(pdata.amountKes);
        await client.query(
          `UPDATE growzia_documents SET data=$2, updated_at=now() WHERE collection='users' AND id=$1`,
          [userRow.id, udata],
        );

        await client.query('COMMIT');
        console.log(`  -> CREDITED KES ${pdata.amountKes}. New balance: ${udata.balanceKes}\n`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
