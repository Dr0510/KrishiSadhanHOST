
import { pool } from './db';

async function fixReceiptAmounts() {
  try {
    console.log('Starting receipt amount fix...');
    
    // Get all receipts with their booking information
    const result = await pool.query(`
      SELECT r.id, r.amount, b."totalPrice" 
      FROM receipts r
      JOIN bookings b ON r."bookingId" = b.id
    `);
    
    console.log(`Found ${result.rows.length} receipts to check`);
    
    for (const receipt of result.rows) {
      const correctAmount = receipt.totalPrice; // This is in rupees
      const currentAmount = receipt.amount;
      
      console.log(`Receipt ${receipt.id}: current=${currentAmount}, correct=${correctAmount}`);
      
      // If amount appears to be stored in paise (100x larger), fix it
      if (currentAmount === correctAmount * 100) {
        // Amount was stored in paise, convert to rupees
        await pool.query(
          'UPDATE receipts SET amount = $1 WHERE id = $2',
          [correctAmount, receipt.id]
        );
        console.log(`✓ Fixed receipt ${receipt.id}: ₹${currentAmount} (paise) -> ₹${correctAmount} (rupees)`);
      } else if (currentAmount === correctAmount * 10) {
        // Amount was multiplied by 10 somehow
        await pool.query(
          'UPDATE receipts SET amount = $1 WHERE id = $2',
          [correctAmount, receipt.id]
        );
        console.log(`✓ Fixed receipt ${receipt.id}: ₹${currentAmount} -> ₹${correctAmount}`);
      } else if (currentAmount !== correctAmount) {
        // If amounts don't match for any other reason, use booking amount
        await pool.query(
          'UPDATE receipts SET amount = $1 WHERE id = $2',
          [correctAmount, receipt.id]
        );
        console.log(`✓ Updated receipt ${receipt.id}: ₹${currentAmount} -> ₹${correctAmount}`);
      } else {
        console.log(`✓ Receipt ${receipt.id} is already correct: ₹${correctAmount}`);
      }
    }
    
    console.log('\n✅ Receipt amount fix completed successfully');
    console.log('Please verify the amounts in the receipt history page.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error fixing receipt amounts:', error);
    process.exit(1);
  }
}

fixReceiptAmounts();
