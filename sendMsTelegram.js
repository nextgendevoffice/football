const axios = require('axios');

async function sendMessageToTelegram(
  botToken = '7152591668:AAGxP302irmbte8aIEf_BZHGvgzBUWN6XWk',
  chatId = '5106306261',
  messageText
) {
  try {
    const response = await axios.post(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        chat_id: chatId,
        text: messageText,
        disable_web_page_preview: false,
        disable_notification: false,
      }
    );

    console.log('Telegram message sent:', response.data);
    return response.data; // ส่งข้อมูล response กลับไปให้ผู้เรียกใช้ฟังก์ชัน (ถ้าต้องการ)
  } catch (error) {
    console.error('Error sending Telegram message:', error);
    throw error; // ส่ง error ต่อเพื่อให้ผู้เรียกใช้ฟังก์ชันสามารถจัดการได้
  }
}

module.exports = {
  sendMessageToTelegram
};
