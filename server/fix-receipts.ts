
import { db } from './db';

async function fixReceiptAmounts() {
  try {
    console.log('Starting receipt amount fix...');
    
    // Get all receipts
    const receipts = await db.query(`
      SELECT r.id, r.amount, b.totalPrice 
      FROM receipts r
      JOIN bookings b ON r.bookingId = b.id
    `);
    
    console.log(`Found ${receipts.rows.length} receipts to check`);
    
    for (const receipt of receipts.rows) {
      const correctAmount = receipt.totalprice;
      const currentAmount = receipt.amount;
      
      // If amount is stored in paise (100x larger), fix it
      if (currentAmount === correctAmount * 100) {
        await db.query(
          'UPDATE receipts SET amount = $1 WHERE id = $2',
          [correctAmount, receipt.id]
        );
        console.log(`Fixed receipt ${receipt.id}: ${currentAmount} -> ${correctAmount}`);
      } else if (currentAmount !== correctAmount) {
        // If amounts don't match, use booking amount
        await db.query(
          'UPDATE receipts SET amount = $1 WHERE id = $2',
          [correctAmount, receipt.id]
        );
        console.log(`Updated receipt ${receipt.id}: ${currentAmount} -> ${correctAmount}`);
      }
    }
    
    console.log('Receipt amount fix completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error fixing receipt amounts:', error);
    process.exit(1);
  }
}

fixReceiptAmounts();
