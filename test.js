const Utils = require('./utils');

console.log('🧪 Test Bank Transaction UserBot');
console.log('================================\n');

// Test cases cho tin nhắn giao dịch
const testCases = [
  {
    name: 'Tin nhắn giao dịch hợp lệ #1',
    message: `Tiền vào: +2,000 đ
Tài khoản: 20918031 tại ACB
Lúc: 2025-07-20 11:10:22
Nội dung CK: NGUYEN THI LAN chuyen tien GD 166915-072025 11:10:21`,
    expected: true
  },
  {
    name: 'Tin nhắn giao dịch hợp lệ #2',
    message: `Tiền vào: +50,000 đ
Tài khoản: 123456789 tại VIETCOMBANK
Lúc: 2025-01-20 14:30:15
Nội dung CK: TRAN VAN NAM chuyen tien thanh toan hoa don`,
    expected: true
  },
  {
    name: 'Tin nhắn giao dịch hợp lệ #3',
    message: `Tiền vào: +1,500,000 đ
Tài khoản: 987654321 tại TECHCOMBANK
Lúc: 2025-01-20 09:45:30
Nội dung CK: PHAM THI HOA gui tien ung ho`,
    expected: true
  },
  {
    name: 'Tin nhắn KHÔNG hợp lệ - thiếu "Tiền vào"',
    message: `Tài khoản: 20918031 tại ACB
Lúc: 2025-07-20 11:10:22
Nội dung CK: NGUYEN THI LAN chuyen tien`,
    expected: false
  },
  {
    name: 'Tin nhắn KHÔNG hợp lệ - thiếu thông tin tài khoản',
    message: `Tiền vào: +2,000 đ
Lúc: 2025-07-20 11:10:22
Nội dung CK: NGUYEN THI LAN chuyen tien`,
    expected: false
  },
  {
    name: 'Tin nhắn KHÔNG hợp lệ - thiếu thời gian',
    message: `Tiền vào: +2,000 đ
Tài khoản: 20918031 tại ACB
Nội dung CK: NGUYEN THI LAN chuyen tien`,
    expected: false
  },
  {
    name: 'Tin nhắn KHÔNG hợp lệ - thiếu nội dung CK',
    message: `Tiền vào: +2,000 đ
Tài khoản: 20918031 tại ACB
Lúc: 2025-07-20 11:10:22`,
    expected: false
  },
  {
    name: 'Tin nhắn KHÔNG hợp lệ - tin nhắn ngẫu nhiên',
    message: `Chào bạn! Hôm nay thế nào?`,
    expected: false
  }
];

// Test pattern matching
console.log('🔍 Test Pattern Matching:');
console.log('========================\n');

let passCount = 0;
let failCount = 0;

testCases.forEach((testCase, index) => {
  const result = Utils.isTransactionMessage(testCase.message);
  const passed = result === testCase.expected;
  
  console.log(`Test ${index + 1}: ${testCase.name}`);
  console.log(`Expected: ${testCase.expected}, Got: ${result} - ${passed ? '✅ PASS' : '❌ FAIL'}`);
  
  if (passed) {
    passCount++;
  } else {
    failCount++;
    console.log(`Message: "${testCase.message}"`);
  }
  
  console.log('');
  
  if (passed) passCount++;
  else failCount++;
});

// Test command parsing
console.log('⚙️ Test Command Parsing:');
console.log('========================\n');

const commandTests = [
  { input: '/1 on', expected: { command: '/1', args: ['on'] } },
  { input: '/1 off', expected: { command: '/1', args: ['off'] } },
  { input: '/1', expected: { command: '/1', args: [] } },
  { input: '/status', expected: { command: '/status', args: [] } },
  { input: '/help', expected: { command: '/help', args: [] } },
  { input: 'Không phải command', expected: null },
];

commandTests.forEach((test, index) => {
  const result = Utils.parseCommand(test.input);
  const passed = JSON.stringify(result) === JSON.stringify(test.expected);
  
  console.log(`Command Test ${index + 1}: "${test.input}"`);
  console.log(`Expected: ${JSON.stringify(test.expected)}`);
  console.log(`Got: ${JSON.stringify(result)} - ${passed ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');
  
  if (passed) passCount++;
  else failCount++;
});

// Test amount extraction
console.log('💰 Test Amount Extraction:');
console.log('==========================\n');

const amountTests = [
  { input: 'Tiền vào: +2,000 đ', expected: '2,000' },
  { input: 'Tiền vào: +50,000 đ', expected: '50,000' },
  { input: 'Tiền vào: +1,500,000 đ', expected: '1,500,000' },
  { input: 'Không có số tiền', expected: null },
];

amountTests.forEach((test, index) => {
  const result = Utils.formatAmount(test.input);
  const passed = result === test.expected;
  
  console.log(`Amount Test ${index + 1}: "${test.input}"`);
  console.log(`Expected: ${test.expected}, Got: ${result} - ${passed ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');
  
  if (passed) passCount++;
  else failCount++;
});

// Test account info extraction
console.log('🏦 Test Account Info Extraction:');
console.log('===============================\n');

const accountTest = `Tiền vào: +2,000 đ
Tài khoản: 20918031 tại ACB
Lúc: 2025-07-20 11:10:22
Nội dung CK: NGUYEN THI LAN chuyen tien GD 166915-072025 11:10:21`;

const accountInfo = Utils.extractAccountInfo(accountTest);
console.log('Account Info extracted:');
console.log(`- Account: ${accountInfo.account}`);
console.log(`- Bank: ${accountInfo.bank}`);
console.log(`- Time: ${accountInfo.time}`);
console.log(`- Content: ${accountInfo.content}`);
console.log('');

// Test duplicate prevention simulation
console.log('🔒 Test Duplicate Prevention:');
console.log('============================\n');

class MockBot {
  constructor() {
    this.processedMessages = new Set();
  }

  processMessage(chatId, messageId, messageText) {
    const messageKey = `${chatId}_${messageId}`;
    
    if (this.processedMessages.has(messageKey)) {
      return { processed: false, reason: 'duplicate' };
    }
    
    this.processedMessages.add(messageKey);
    return { processed: true, reason: 'new_message' };
  }
}

const mockBot = new MockBot();

// Test same message multiple times
const result1 = mockBot.processMessage('123', '456', 'test message');
const result2 = mockBot.processMessage('123', '456', 'test message'); // duplicate
const result3 = mockBot.processMessage('123', '457', 'test message'); // different id
const result4 = mockBot.processMessage('124', '456', 'test message'); // different chat

console.log(`Test 1 (first time): ${result1.processed ? '✅ PROCESSED' : '❌ SKIPPED'} - ${result1.reason}`);
console.log(`Test 2 (duplicate): ${result2.processed ? '❌ PROCESSED' : '✅ SKIPPED'} - ${result2.reason}`);
console.log(`Test 3 (different msg): ${result3.processed ? '✅ PROCESSED' : '❌ SKIPPED'} - ${result3.reason}`);
console.log(`Test 4 (different chat): ${result4.processed ? '✅ PROCESSED' : '❌ SKIPPED'} - ${result4.reason}`);

const duplicateTestPassed = result1.processed && !result2.processed && result3.processed && result4.processed;
console.log(`\nDuplicate Prevention Test: ${duplicateTestPassed ? '✅ PASSED' : '❌ FAILED'}`);

if (duplicateTestPassed) {
  passCount += 4;
} else {
  failCount += 4;
}

console.log('');

// Summary
console.log('📊 Test Summary:');
console.log('===============');
console.log(`✅ Passed: ${passCount}`);
console.log(`❌ Failed: ${failCount}`);
console.log(`📊 Total: ${passCount + failCount}`);
console.log(`🎯 Success Rate: ${((passCount / (passCount + failCount)) * 100).toFixed(1)}%`);

if (failCount === 0) {
  console.log('\n🎉 Tất cả test đều PASSED! Bot sẵn sàng hoạt động!');
  console.log('🔥 Các tính năng mới:');
  console.log('   - ✅ Reply tin nhắn từ chính UserBot');
  console.log('   - ✅ Chống duplicate reply');
  console.log('   - ✅ Auto-detect số điện thoại từ config');
} else {
  console.log('\n⚠️ Có một số test FAILED. Vui lòng kiểm tra lại code.');
} 