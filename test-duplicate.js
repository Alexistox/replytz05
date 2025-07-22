const Utils = require('./utils');

console.log('🧪 Test Duplicate Prevention Advanced');
console.log('======================================\n');

// Simulate bot class với duplicate protection
class TestBot {
  constructor() {
    this.processedMessages = new Map();
    this.processingMessages = new Set();
    this.replyCount = 0;
  }

  async simulateMessage(chatId, messageId, messageText, isOut = false) {
    console.log(`📨 Nhận message: ${chatId}_${messageId} - "${messageText.substring(0, 20)}..."`);
    
    const currentTime = Date.now();
    const messageKey = `${chatId}_${messageId}`;
    
    // Check duplicate
    if (this.processedMessages.has(messageKey)) {
      const processedTime = this.processedMessages.get(messageKey);
      if (currentTime - processedTime < 30000) {
        console.log(`🔄 Skip duplicate: ${messageKey}`);
        return { action: 'skipped', reason: 'duplicate' };
      }
    }

    // Check processing
    if (this.processingMessages.has(messageKey)) {
      console.log(`⏳ Message đang xử lý: ${messageKey}`);
      return { action: 'skipped', reason: 'processing' };
    }

    // Mark as processing
    this.processingMessages.add(messageKey);

    try {
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, Math.random() * 100));

      if (Utils.isTransactionMessage(messageText)) {
        // Double-check reply
        const replyKey = `reply_${messageKey}`;
        if (this.processedMessages.has(replyKey)) {
          console.log(`🚫 Đã reply rồi: ${messageKey}`);
          return { action: 'skipped', reason: 'already_replied' };
        }

        // Mark as processed
        this.processedMessages.set(messageKey, currentTime);
        this.processedMessages.set(replyKey, currentTime);
        
        this.replyCount++;
        console.log(`✅ REPLY #${this.replyCount} cho ${messageKey}`);
        
        return { action: 'replied', count: this.replyCount };
      }

      return { action: 'ignored', reason: 'not_transaction' };
      
    } finally {
      this.processingMessages.delete(messageKey);
    }
  }
}

// Test cases
async function runTests() {
  const bot = new TestBot();
  
  const transactionMessage = `Tiền vào: +3,000 đ
Tài khoản: 20918031 tại ACB
Lúc: 2025-07-22 12:40:53
Nội dung CK: NGUYEN THI LAN chuyen tien GD 318856-072225 12:40:52`;

  console.log('🔥 Test 1: Cùng message từ các events khác nhau\n');
  
  // Simulate multiple events cho cùng một message (như trong thực tế)
  const results = await Promise.all([
    bot.simulateMessage('123', '456', transactionMessage),
    bot.simulateMessage('123', '456', transactionMessage), // duplicate
    bot.simulateMessage('123', '456', transactionMessage), // duplicate
  ]);

  console.log('\nKết quả:');
  results.forEach((result, index) => {
    console.log(`Event ${index + 1}: ${result.action} (${result.reason || 'success'})`);
  });

  console.log(`\n📊 Tổng số reply: ${bot.replyCount} (mong đợi: 1)`);
  console.log(`${bot.replyCount === 1 ? '✅ PASSED' : '❌ FAILED'}: Duplicate prevention\n`);

  // Test 2: Messages khác nhau
  console.log('🔥 Test 2: Messages khác nhau\n');
  
  const result2 = await bot.simulateMessage('123', '457', transactionMessage); // khác messageId
  const result3 = await bot.simulateMessage('124', '456', transactionMessage); // khác chatId

  console.log(`Message khác ID: ${result2.action}`);
  console.log(`Message khác Chat: ${result3.action}`);
  console.log(`📊 Tổng số reply: ${bot.replyCount} (mong đợi: 3)`);
  console.log(`${bot.replyCount === 3 ? '✅ PASSED' : '❌ FAILED'}: Different messages\n`);

  // Test 3: Concurrent processing
  console.log('🔥 Test 3: Concurrent processing\n');
  
  const concurrentResults = await Promise.all([
    bot.simulateMessage('999', '888', transactionMessage),
    bot.simulateMessage('999', '888', transactionMessage),
    bot.simulateMessage('999', '888', transactionMessage),
  ]);

  const processedCount = concurrentResults.filter(r => r.action === 'replied').length;
  console.log(`Concurrent replies: ${processedCount} (mong đợi: 1)`);
  console.log(`${processedCount === 1 ? '✅ PASSED' : '❌ FAILED'}: Concurrent protection\n`);

  // Summary
  const totalTests = 3;
  const passedTests = (bot.replyCount === 4 && processedCount === 1) ? 3 : 0;
  
  console.log('📋 SUMMARY');
  console.log('==========');
  console.log(`✅ Passed: ${passedTests}/${totalTests}`);
  console.log(`📊 Total replies: ${bot.replyCount} (mong đợi: 4)`);
  console.log(`🎯 Success rate: ${((passedTests/totalTests)*100).toFixed(0)}%`);
  
  if (passedTests === totalTests) {
    console.log('\n🎉 Tất cả test PASSED! Duplicate prevention hoạt động hoàn hảo!');
  } else {
    console.log('\n⚠️ Có test FAILED. Cần kiểm tra lại logic.');
  }
}

// Run tests
runTests().catch(console.error); 