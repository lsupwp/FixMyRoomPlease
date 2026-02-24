const express = require('express');

const router = express.Router();

// Mock data for chat
const mockMessages = [
    {
        id: 1,
        sender: 'admin',
        senderName: 'Admin Support',
        senderAvatar: 'A',
        message: 'สวัสดีค่ะ มีปัญหาอะไรให้ช่วยได้ไหมค่ะ',
        timestamp: '09:30'
    },
    {
        id: 2,
        sender: 'tenant',
        senderName: 'You',
        message: 'สวัสดีค่ะ ค่างานแอร์อะครับ เมื่อวานฉันแจ้งหน่อยว่าไม่เย็น แต่ยังไม่มีใครมาตรวจ',
        timestamp: '09:32'
    },
    {
        id: 3,
        sender: 'admin',
        senderName: 'Admin Support',
        senderAvatar: 'A',
        message: 'ขอโทษค่ะ ช่วงนี้วิศวกรมีงานเยอะ แต่วันนี้ตอนเย็นจะมาตรวจให้ค่ะ ประมาณ 16:00 น. ได้ไหมค่ะ',
        timestamp: '09:35'
    },
    {
        id: 4,
        sender: 'tenant',
        senderName: 'You',
        message: 'ได้ค่ะ ขอบคุณนะคะ',
        timestamp: '09:36'
    },
    {
        id: 5,
        sender: 'admin',
        senderName: 'Admin Support',
        senderAvatar: 'A',
        message: 'ไม่เป็นไรค่ะ หากมีปัญหาอะไรอีกสามารถติดต่อได้ตลอด 😊',
        timestamp: '09:37'
    }
];

router.get('/chat', (req, res) => {
    res.render('tenant/chat', { 
        title: 'แชท',
        messages: mockMessages,
        userRole: 'tenant' // ในอนาคตจะเก็บมาจาก session หรือ JWT
    });
});

module.exports = router;
