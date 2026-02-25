const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { WebSocket } = require('ws');
const pool = require('../../db');

const router = express.Router();

const uploadDir = path.join(__dirname, '../../public/uploads/chat');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const username = req.session?.username || 'admin';
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        cb(null, `${username}_chat_${timestamp}${ext}`);
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Only image files are allowed'));
        }
        cb(null, true);
    }
});

const withConnection = async (handler) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const result = await handler(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

const formatTime = (value) => {
    if (!value) return null;
    return new Date(value).toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit'
    });
};

const buildMessagesFromRows = (rows) => {
    const messageMap = new Map();

    rows.forEach((row) => {
        if (!messageMap.has(row.message_id)) {
            messageMap.set(row.message_id, {
                id: row.message_id,
                sender: row.role,
                senderName: row.role === 'admin' ? 'คุณ' : row.username,
                senderAvatar: row.role === 'admin' ? 'A' : row.username.charAt(0).toUpperCase(),
                message: row.message_text,
                timestamp: formatTime(row.created_at),
                isDeleted: row.is_deleted,
                attachments: []
            });
        }

        if (row.file_url) {
            messageMap.get(row.message_id).attachments.push({
                url: row.file_url,
                type: row.file_type
            });
        }
    });

    return Array.from(messageMap.values());
};

router.get('/chat', async (req, res) => {
    if (!req.session || req.session.role !== 'admin') {
        return res.redirect('/login');
    }

    try {
        // Get all inboxes with tenant info and unread count
        const inboxes = await withConnection(async (connection) => {
            const [rows] = await connection.execute(
                `
                    SELECT 
                        i.inbox_id,
                        i.tenant_id,
                        a.username,
                        t.room_number,
                        (SELECT message_text 
                         FROM messages 
                         WHERE inbox_id = i.inbox_id AND is_deleted = FALSE 
                         ORDER BY created_at DESC 
                         LIMIT 1) as last_message,
                        (SELECT created_at 
                         FROM messages 
                         WHERE inbox_id = i.inbox_id AND is_deleted = FALSE 
                         ORDER BY created_at DESC 
                         LIMIT 1) as last_message_time,
                        COALESCE(ip.last_read_message_id, 0) as last_read_message_id,
                        (SELECT COUNT(*) 
                         FROM messages 
                         WHERE inbox_id = i.inbox_id 
                         AND sender_id != ? 
                         AND message_id > COALESCE(ip.last_read_message_id, 0)
                         AND is_deleted = FALSE) as unread_count
                    FROM inbox i
                    LEFT JOIN inbox_participants ip ON i.inbox_id = ip.inbox_id AND ip.account_id = ?
                    JOIN tenants t ON t.account_id = i.tenant_id
                    JOIN accounts a ON a.account_id = i.tenant_id
                    WHERE i.admin_id = ?
                    ORDER BY last_message_time DESC
                `,
                [req.session.account_id, req.session.account_id, req.session.account_id]
            );

            return rows.map(row => ({
                inboxId: row.inbox_id,
                tenantId: row.tenant_id,
                username: row.username,
                roomNumber: row.room_number,
                lastMessage: row.last_message ? (row.last_message.length > 40 ? row.last_message.slice(0, 40) + '...' : row.last_message) : 'ยังไม่มีข้อความ',
                lastMessageTime: row.last_message_time ? formatTime(row.last_message_time) : '',
                unreadCount: row.unread_count || 0,
                lastReadMessageId: row.last_read_message_id
            }));
        });

        // Get selected inbox
        const selectedInboxId = req.query.inbox ? parseInt(req.query.inbox) : (inboxes.length > 0 ? inboxes[0].inboxId : null);
        
        let messages = [];
        let selectedInbox = null;

        if (selectedInboxId) {
            selectedInbox = inboxes.find(i => i.inboxId === selectedInboxId);
            
            messages = await withConnection(async (connection) => {
                const [idRows] = await connection.execute(
                    `
                        SELECT message_id
                        FROM messages
                        WHERE inbox_id = ?
                        ORDER BY message_id DESC
                        LIMIT 20
                    `,
                    [selectedInboxId]
                );

                const messageIds = idRows.map((row) => row.message_id);
                if (messageIds.length === 0) {
                    return [];
                }

                const placeholders = messageIds.map(() => '?').join(',');
                const [rows] = await connection.execute(
                    `
                        SELECT 
                            m.message_id,
                            m.message_text,
                            m.created_at,
                            m.sender_id,
                            m.is_deleted,
                            a.role,
                            a.username,
                            ma.file_url,
                            ma.file_type,
                            ma.attachment_id
                        FROM messages m
                        JOIN accounts a ON a.account_id = m.sender_id
                        LEFT JOIN message_attachments ma
                            ON ma.message_id = m.message_id
                            AND ma.is_deleted = FALSE
                        WHERE m.message_id IN (${placeholders})
                        ORDER BY m.message_id DESC, ma.attachment_id ASC
                    `,
                    messageIds
                );

                return buildMessagesFromRows(rows).reverse();
            });
        }

        return res.render('admin/chat', {
            title: 'แชท',
            inboxes: inboxes,
            messages: messages,
            selectedInbox: selectedInbox,
            userRole: 'admin'
        });
    } catch (error) {
        console.error('Admin chat fetch error:', error);
        return res.render('admin/chat', {
            title: 'แชท',
            inboxes: [],
            messages: [],
            selectedInbox: null,
            userRole: 'admin'
        });
    }
});

router.get('/chat/messages', async (req, res) => {
    if (!req.session || req.session.role !== 'admin') {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const inboxId = parseInt(req.query.inboxId);
    const beforeId = parseInt(req.query.beforeId);

    if (!inboxId || !beforeId) {
        return res.status(400).json({ error: 'Missing inboxId or beforeId' });
    }

    try {
        const result = await withConnection(async (connection) => {
            const [idRows] = await connection.execute(
                `
                    SELECT message_id
                    FROM messages
                    WHERE inbox_id = ?
                        AND message_id < ?
                    ORDER BY message_id DESC
                    LIMIT 21
                `,
                [inboxId, beforeId]
            );

            const hasMore = idRows.length > 20;
            if (hasMore) {
                idRows.pop();
            }

            const messageIds = idRows.map((row) => row.message_id);
            if (messageIds.length === 0) {
                return { messages: [], hasMore };
            }

            const placeholders = messageIds.map(() => '?').join(',');
            const [rows] = await connection.execute(
                `
                    SELECT 
                        m.message_id,
                        m.message_text,
                        m.created_at,
                        m.sender_id,
                        m.is_deleted,
                        a.role,
                        a.username,
                        ma.file_url,
                        ma.file_type,
                        ma.attachment_id
                    FROM messages m
                    JOIN accounts a ON a.account_id = m.sender_id
                    LEFT JOIN message_attachments ma
                        ON ma.message_id = m.message_id
                        AND ma.is_deleted = FALSE
                    WHERE m.message_id IN (${placeholders})
                    ORDER BY m.message_id DESC, ma.attachment_id ASC
                `,
                messageIds
            );

            const messages = buildMessagesFromRows(rows).reverse();
            return { messages, hasMore };
        });

        return res.json(result);
    } catch (error) {
        console.error('Admin chat pagination error:', error);
        return res.status(500).json({ error: 'Failed to load messages' });
    }
});

router.post('/chat/send', upload.array('images', 3), async (req, res) => {
    if (!req.session || req.session.role !== 'admin') {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { message, inboxId } = req.body;
    const text = (message || '').trim();
    const files = req.files || [];

    if (!text && files.length === 0) {
        return res.status(400).json({ error: 'Message or image is required' });
    }

    try {
        const result = await withConnection(async (connection) => {
            const [insertResult] = await connection.execute(
                `INSERT INTO messages (inbox_id, sender_id, message_text) VALUES (?, ?, ?)`,
                [inboxId, req.session.account_id, text]
            );

            const messageId = insertResult.insertId;

            if (files.length > 0) {
                const attachments = files.map((file) => [
                    messageId,
                    `/uploads/chat/${file.filename}`,
                    file.mimetype
                ]);

                await connection.query(
                    'INSERT INTO message_attachments (message_id, file_url, file_type) VALUES ?'
                    , [attachments]
                );
            }

            const [messageRow] = await connection.execute(
                `
                    SELECT 
                        m.message_id,
                        m.message_text,
                        m.created_at,
                        m.sender_id,
                        a.role,
                        a.username,
                        ma.file_url,
                        ma.file_type,
                        ma.attachment_id
                    FROM messages m
                    JOIN accounts a ON a.account_id = m.sender_id
                    LEFT JOIN message_attachments ma
                        ON ma.message_id = m.message_id
                        AND ma.is_deleted = FALSE
                    WHERE m.message_id = ?
                `,
                [messageId]
            );

            const messageData = buildMessagesFromRows(messageRow)[0];
            return {
                ...messageData,
                inboxId: inboxId
            };
        });

        const wss = req.app.get('wss');
        if (wss) {
            const payload = JSON.stringify(result);
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(payload);
                }
            });
        }

        return res.json(result);
    } catch (error) {
        console.error('Admin send message error:', error);
        return res.status(500).json({ error: 'Failed to send message' });
    }
});

router.delete('/chat/message/:id', async (req, res) => {
    if (!req.session || req.session.role !== 'admin') {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const messageId = parseInt(req.params.id);

    try {
        await withConnection(async (connection) => {
            await connection.execute(
                `
                    UPDATE messages
                    SET is_deleted = TRUE
                    WHERE message_id = ? AND sender_id = ?
                `,
                [messageId, req.session.account_id]
            );
        });

        const wss = req.app.get('wss');
        if (wss) {
            const payload = JSON.stringify({
                type: 'delete',
                messageId: messageId,
                inboxId: req.body?.inboxId || null
            });
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(payload);
                }
            });
        }

        return res.json({ success: true });
    } catch (error) {
        console.error('Admin delete message error:', error);
        return res.status(500).json({ error: 'Failed to delete message' });
    }
});

// Mark messages as read
router.post('/chat/mark-read', async (req, res) => {
    if (!req.session || req.session.role !== 'admin') {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { inboxId, messageId } = req.body;
    if (!inboxId || !messageId) {
        return res.status(400).json({ error: 'Missing inboxId or messageId' });
    }

    try {
        let unreadCount = 0;
        await withConnection(async (connection) => {
            await connection.execute(
                `
                    INSERT INTO inbox_participants (inbox_id, account_id, last_read_message_id)
                    VALUES (?, ?, ?)
                    ON DUPLICATE KEY UPDATE last_read_message_id = VALUES(last_read_message_id)
                `,
                [inboxId, req.session.account_id, messageId]
            );
            
            // Calculate unread count
            const [unreadRows] = await connection.query(
                `SELECT COUNT(*) as count FROM messages 
                 WHERE inbox_id = ? AND sender_id != ? AND message_id > ? AND is_deleted = FALSE`,
                [inboxId, req.session.account_id, messageId]
            );
            unreadCount = unreadRows[0]?.count || 0;
        });

        // Don't broadcast - let frontend update locally
        return res.json({ success: true, unreadCount });
    } catch (error) {
        console.error('Mark read error:', error);
        return res.status(500).json({ error: 'Failed to mark as read' });
    }
});

module.exports = router;
