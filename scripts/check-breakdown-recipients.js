/**
 * Print which users would receive breakdown notification emails.
 * Run: node scripts/check-breakdown-recipients.js
 */
import 'dotenv/config';
import { query, getPool, close } from '../src/db.js';
import { getCommandCentreAndRectorEmails } from '../src/lib/emailRecipients.js';

async function main() {
  try {
    const emails = await getCommandCentreAndRectorEmails(query);
    console.log('Breakdown notification would be sent to', emails.length, 'recipient(s):');
    if (emails.length === 0) {
      console.log('  (none – add Command Centre / Rector / Access management page to users in User Management, and set their email)');
    } else {
      emails.forEach((e, i) => console.log('  ', i + 1 + '.', e));
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exitCode = 1;
  } finally {
    await close();
  }
}

main();
