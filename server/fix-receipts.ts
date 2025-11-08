
import { db } from './db';

async function fixReceiptAmounts() {
  try {
    console.log('Starting receipt amount fix...');
    
    // Get all receipts with their booking information
    const result = await db.query(`
      SELECT r.id, r.amount, b.totalPrice 
      FROM receipts r
      JOIN bookings b ON r."bookingId" = b.id
    `);
    
    console.log(`Found ${result.rows.length} receipts to check`);
    
    for (const receipt of result.rows) {
      const correctAmount = receipt.totalprice; // This is in rupees
      const currentAmount = receipt.amount;
      
      // If amount appears to be stored in paise (100x or 10x larger), fix it
      if (currentAmount === correctAmount * 100) {
        // Amount was stored in paise, convert to rupees
        await db.query(
          'UPDATE receipts SET amount = $1 WHERE id = $2',
          [correctAmount, receipt.id]
        );
        console.log(`Fixed receipt ${receipt.id}: ${currentAmount} (paise) -> ${correctAmount} (rupees)`);
      } else if (currentAmount !== correctAmount) {
        // If amounts don't match for any other reason, use booking amount
        await db.query(
          'UPDATE receipts SET amount = $1 WHERE id = $2',
          [correctAmount, receipt.id]
        );
        console.log(`Updated receipt ${receipt.id}: ${currentAmount} -> ${correctAmount}`);
      } else {
        console.log(`Receipt ${receipt.id} is already correct: ${correctAmount}`);
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
