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
        const username = req.session?.username || 'unknown';
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
    const isAdmin = (role) => role && String(role).toLowerCase() === 'admin';

    rows.forEach((row) => {
        if (!messageMap.has(row.message_id)) {
            const name = isAdmin(row.role) ? 'Admin' : (row.username || 'ผู้ใช้');
            const avatar = isAdmin(row.role) ? 'A' : (row.username ? String(row.username).charAt(0).toUpperCase() : '?');
            messageMap.set(row.message_id, {
                id: row.message_id,
                sender: row.role,
                senderName: name,
                senderAvatar: avatar,
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
    if (!req.session || req.session.role !== 'tenant') {
        return res.redirect('/login');
    }

    try {
        // Get or create inbox
        const inbox = await withConnection(async (connection) => {
            // Try to find existing inbox
            const [inboxRows] = await connection.execute(
                `SELECT inbox_id FROM inbox WHERE tenant_id = ?`,
                [req.session.account_id]
            );

            let inboxId;
            if (inboxRows.length > 0) {
                inboxId = inboxRows[0].inbox_id;
            } else {
                // Create new inbox with first admin
                const [adminRows] = await connection.execute(
                    `SELECT account_id FROM admin LIMIT 1`
                );
                
                if (adminRows.length === 0) {
                    throw new Error('No admin available');
                }

                const [result] = await connection.execute(
                    `INSERT INTO inbox (tenant_id, admin_id) VALUES (?, ?)`,
                    [req.session.account_id, adminRows[0].account_id]
                );
                inboxId = result.insertId;
            }

            return inboxId;
        });

        // Get messages
        const messages = await withConnection(async (connection) => {
            const [idRows] = await connection.execute(
                `
                    SELECT message_id
                    FROM messages
                    WHERE inbox_id = ?
                    ORDER BY message_id DESC
                    LIMIT 20
                `,
                [inbox]
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

        return res.render('tenant/chat', {
            title: 'แชท',
            messages: messages,
            userRole: 'tenant',
            inboxId: inbox
        });
    } catch (error) {
        console.error('Chat fetch error:', error);
        return res.render('tenant/chat', {
            title: 'แชท',
            messages: [],
            userRole: 'tenant',
            inboxId: null
        });
    }
});

router.get('/chat/messages', async (req, res) => {
    if (!req.session || req.session.role !== 'tenant') {
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
        console.error('Chat pagination error:', error);
        return res.status(500).json({ error: 'Failed to load messages' });
    }
});

router.post('/chat/send', upload.array('images', 3), async (req, res) => {
    if (!req.session || req.session.role !== 'tenant') {
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
            
            // Calculate actual unread count based on admin's last_read_message_id
            try {
                const [inboxRows] = await pool.query(
                    `SELECT admin_id FROM inbox WHERE inbox_id = ?`,
                    [inboxId]
                );

                if (inboxRows.length > 0) {
                    const adminId = inboxRows[0].admin_id;

                    const [participantRows] = await pool.query(
                        `SELECT last_read_message_id FROM inbox_participants WHERE inbox_id = ? AND account_id = ?`,
                        [inboxId, adminId]
                    );
                    const lastReadMessageId = participantRows.length > 0 ? (participantRows[0].last_read_message_id || 0) : 0;

                    const [unreadRows] = await pool.query(
                        `SELECT COUNT(*) as count
                         FROM messages
                         WHERE inbox_id = ?
                           AND sender_id = ?
                           AND message_id > ?
                           AND is_deleted = FALSE`,
                        [inboxId, req.session.account_id, lastReadMessageId]
                    );
                    const actualUnreadCount = unreadRows[0]?.count || 0;

                    const previewText = text || (files.length > 0 ? '📷 รูปภาพ' : '');
                    const unreadUpdate = JSON.stringify({
                        type: 'unread-update',
                        inboxId: inboxId,
                        unreadCount: actualUnreadCount,
                        lastMessage: previewText,
                        lastMessageTime: result?.timestamp || formatTime(new Date()),
                        bump: true
                    });
                    wss.clients.forEach((client) => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(unreadUpdate);
                        }
                    });
                }
            } catch (err) {
                console.error('Error calculating unread count:', err);
            }
        }

        return res.json(result);
    } catch (error) {
        console.error('Send message error:', error);
        return res.status(500).json({ error: 'Failed to send message' });
    }
});

router.delete('/chat/message/:id', async (req, res) => {
    if (!req.session || req.session.role !== 'tenant') {
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
        console.error('Delete message error:', error);
        return res.status(500).json({ error: 'Failed to delete message' });
    }
});

module.exports = router;
